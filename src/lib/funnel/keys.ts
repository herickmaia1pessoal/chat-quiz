export const FUNNEL_UTM_KEYS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
] as const

const FUNNEL_UTM_KEY_SET = new Set<string>(FUNNEL_UTM_KEYS)

export function isSupportedFunnelUtmKey(value: string) {
  return FUNNEL_UTM_KEY_SET.has(value.trim())
}

export function funnelKeyIdentity(value: string) {
  return value.trim().toLowerCase()
}

export function isReservedFunnelKey(value: string) {
  const key = value.trim().toLowerCase()
  return key === 'score'
    || key.startsWith('system.')
    || key.startsWith('lead.')
    || key.startsWith('answer.')
    || key.startsWith('utm_')
}

export function isValidResponseFieldKey(value: string) {
  const key = value.trim()
  return /^[A-Za-z][A-Za-z0-9_.-]{0,127}$/.test(key)
    && !isReservedFunnelKey(key)
}

export function isValidCustomVariableKey(value: string) {
  const key = value.trim()
  return /^[A-Za-z][A-Za-z0-9_.-]{0,127}$/.test(key)
    && !isReservedFunnelKey(key)
}

export function safeCustomVariableBase(value: string) {
  return isValidCustomVariableKey(value) ? value.trim() : 'variavel'
}

export function safeResponseFieldBase(value: string) {
  return isValidResponseFieldKey(value) ? value.trim() : 'resposta'
}
