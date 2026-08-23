import { createClient } from 'npm:@supabase/supabase-js@2.112.3'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SIGNATURE_PATTERN = /^sha256=[0-9a-f]{64}$/
const HOST_PATTERN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})$/
const BLOCKED_SUFFIXES = [
  '.local', '.internal', '.localhost', '.home.arpa',
  '.localtest.me', '.localhost.direct', '.lvh.me', '.vcap.me', '.nip.io', '.sslip.io',
]
const attemptsByAddress = new Map<string, { count: number; resetAt: number }>()

class DeliveryError extends Error {
  constructor(message: string, readonly retryable: boolean) {
    super(message)
  }
}

interface ClaimedDelivery {
  deliveryId: string
  claimToken: string
  attempt: number
  url: string
  payloadText: string
  outgoingSignature: string
}

interface DnsAnswer {
  type?: number
  data?: string
}

interface DnsResponse {
  Status?: number
  Answer?: DnsAnswer[]
}

function secretKey() {
  const keyMap = Deno.env.get('SUPABASE_SECRET_KEYS')
  if (keyMap) {
    const parsed = JSON.parse(keyMap) as Record<string, string>
    if (parsed.default) return parsed.default
  }
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!legacy) throw new Error('Supabase secret key is unavailable')
  return legacy
}

function rateLimited(request: Request) {
  const now = Date.now()
  if (attemptsByAddress.size > 2000) {
    for (const [key, value] of attemptsByAddress) {
      if (value.resetAt <= now) attemptsByAddress.delete(key)
    }
  }
  const address = (request.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim()
  const current = attemptsByAddress.get(address)
  if (!current || current.resetAt <= now) {
    attemptsByAddress.set(address, { count: 1, resetAt: now + 60_000 })
    return false
  }
  current.count += 1
  return current.count > 120
}

function isPublicIpv4(value: string) {
  const octets = value.split('.').map(Number)
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false
  const [a, b, c] = octets
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false
  if (a === 100 && b >= 64 && b <= 127) return false
  if (a === 169 && b === 254) return false
  if (a === 172 && b >= 16 && b <= 31) return false
  if (a === 192 && (b === 0 || (b === 168) || (b === 88 && c === 99))) return false
  if (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) return false
  if (a === 203 && b === 0 && c === 113) return false
  return true
}

function isPublicIpv6(value: string) {
  const normalized = value.toLowerCase().replace(/^\[|\]$/g, '')
  if (!normalized.includes(':') || normalized.includes('.')) return false
  const first = Number.parseInt(normalized.split(':')[0] || '0', 16)
  if (!Number.isFinite(first) || first < 0x2000 || first > 0x3fff) return false
  return !normalized.startsWith('2001:db8:')
}

function assertHostname(hostname: string) {
  const normalized = hostname.toLowerCase()
  if (!HOST_PATTERN.test(normalized) || normalized.endsWith('.')) {
    throw new DeliveryError('Webhook hostname is invalid', false)
  }
  if (BLOCKED_SUFFIXES.some((suffix) => normalized === suffix.slice(1) || normalized.endsWith(suffix))) {
    throw new DeliveryError('Webhook hostname is not public', false)
  }
}

function assertAllowedHostname(hostname: string) {
  const rules = (Deno.env.get('FUNNEL_WEBHOOK_ALLOWED_HOSTS') || '')
    .split(',')
    .map((rule) => rule.trim().toLowerCase().replace(/\.$/, ''))
    .filter(Boolean)

  if (!rules.length) {
    throw new DeliveryError('Webhook destination is not enabled by the platform administrator', false)
  }

  const normalized = hostname.toLowerCase()
  const allowed = rules.some((rule) => {
    if (rule.startsWith('*.')) {
      const suffix = rule.slice(1)
      return normalized.endsWith(suffix) && normalized.length > suffix.length
    }
    return normalized === rule
  })

  if (!allowed) {
    throw new DeliveryError('Webhook hostname is not approved by the platform administrator', false)
  }
}

async function queryDns(hostname: string, type: 'A' | 'AAAA') {
  const response = await fetch(
    `https://dns.google/resolve?name=${encodeURIComponent(hostname)}&type=${type}`,
    { headers: { Accept: 'application/dns-json' }, signal: AbortSignal.timeout(3000) },
  )
  if (!response.ok) throw new DeliveryError('DNS validation service failed', true)
  return await response.json() as DnsResponse
}

async function assertPublicDns(hostname: string, depth = 0): Promise<void> {
  if (depth > 4) throw new DeliveryError('Webhook DNS chain is too deep', false)
  assertHostname(hostname)

  let responses: DnsResponse[]
  try {
    responses = await Promise.all([queryDns(hostname, 'A'), queryDns(hostname, 'AAAA')])
  } catch (error) {
    if (error instanceof DeliveryError) throw error
    throw new DeliveryError('Webhook DNS validation failed', true)
  }

  const answers = responses.flatMap((response) => response.Answer || [])
  const addresses = answers.filter((answer) => answer.type === 1 || answer.type === 28)
  if (addresses.length > 0) {
    for (const answer of addresses) {
      const address = (answer.data || '').trim()
      const valid = answer.type === 1 ? isPublicIpv4(address) : isPublicIpv6(address)
      if (!valid) throw new DeliveryError('Webhook DNS resolved to a non-public address', false)
    }
    return
  }

  const aliases = [...new Set(
    answers
      .filter((answer) => answer.type === 5 && answer.data)
      .map((answer) => answer.data!.replace(/\.$/, '').toLowerCase()),
  )]
  if (!aliases.length) throw new DeliveryError('Webhook hostname did not resolve publicly', true)
  for (const alias of aliases) await assertPublicDns(alias, depth + 1)
}

async function validateDestination(rawUrl: string) {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new DeliveryError('Webhook URL is invalid', false)
  }
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) {
    throw new DeliveryError('Webhook must use standard HTTPS without credentials', false)
  }
  assertHostname(url.hostname)
  assertAllowedHostname(url.hostname)
  await assertPublicDns(url.hostname)
  return url
}

async function readLimitedBody(response: Response, limit = 8000) {
  if (!response.body) return ''
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let output = ''
  while (output.length < limit) {
    const { done, value } = await reader.read()
    if (done) break
    output += decoder.decode(value, { stream: true })
  }
  if (output.length >= limit) await reader.cancel()
  return output.slice(0, limit)
}

async function readRequestJson(request: Request, limit = 2048) {
  if (!request.body) throw new Error('Request body is required')
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > limit) {
      await reader.cancel()
      throw new Error('Request body is too large')
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown
}

function isClaimedDelivery(value: unknown): value is ClaimedDelivery {
  if (!value || typeof value !== 'object') return false
  const row = value as Partial<ClaimedDelivery>
  return typeof row.deliveryId === 'string'
    && typeof row.claimToken === 'string'
    && typeof row.attempt === 'number'
    && typeof row.url === 'string'
    && typeof row.payloadText === 'string'
    && typeof row.outgoingSignature === 'string'
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  let deliveryId = ''
  try {
    const body = await readRequestJson(request) as { deliveryId?: unknown }
    deliveryId = typeof body.deliveryId === 'string' ? body.deliveryId : ''
  } catch {
    return new Response('Invalid request', { status: 400 })
  }
  const workerSignature = request.headers.get('x-funnelflow-worker-signature') || ''
  if (!UUID_PATTERN.test(deliveryId) || !SIGNATURE_PATTERN.test(workerSignature)) {
    return Response.json({ accepted: true }, { status: 202 })
  }
  if (rateLimited(request)) return new Response('Too many requests', { status: 429 })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  if (!supabaseUrl) return new Response('Worker unavailable', { status: 503 })
  const supabase = createClient(supabaseUrl, secretKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: claimed, error: claimError } = await supabase.rpc(
    'claim_funnel_webhook_delivery',
    { p_delivery_id: deliveryId, p_worker_signature: workerSignature },
  )
  if (claimError || !isClaimedDelivery(claimed)) {
    return Response.json({ accepted: true }, { status: 202 })
  }

  let succeeded = false
  let retryable = true
  let statusCode: number | null = null
  let responseBody = ''
  let errorMessage = ''

  try {
    const destination = await validateDestination(claimed.url)
    const response = await fetch(destination, {
      method: 'POST',
      redirect: 'manual',
      signal: AbortSignal.timeout(7000),
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'FunnelFlow-Webhook/2.0',
        'X-FunnelFlow-Event': 'funnel.completed',
        'X-FunnelFlow-Signature': claimed.outgoingSignature,
        'X-FunnelFlow-Delivery': claimed.deliveryId,
        'X-FunnelFlow-Attempt': String(claimed.attempt),
      },
      body: claimed.payloadText,
    })
    statusCode = response.status
    responseBody = await readLimitedBody(response)
    succeeded = response.status >= 200 && response.status < 300
    retryable = response.status === 408 || response.status === 425 || response.status === 429 || response.status >= 500
    if (!succeeded) errorMessage = `HTTP ${response.status}`
  } catch (error) {
    retryable = error instanceof DeliveryError ? error.retryable : true
    errorMessage = error instanceof Error ? error.message : 'Webhook request failed'
  }

  const { error: finishError } = await supabase.rpc('finish_funnel_webhook_delivery', {
    p_delivery_id: claimed.deliveryId,
    p_claim_token: claimed.claimToken,
    p_succeeded: succeeded,
    p_retryable: retryable,
    p_status_code: statusCode,
    p_response_body: responseBody,
    p_error: errorMessage || null,
  })
  if (finishError) console.error('Could not persist webhook outcome', finishError.message)

  return Response.json({ accepted: true }, { status: 202 })
})
