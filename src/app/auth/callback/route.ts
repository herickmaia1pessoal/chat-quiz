import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/utils/supabase/server'

// Handles the redirect Supabase Auth sends the browser to after a password
// reset (or any other PKCE-flow) email link is clicked. The link itself
// only carries a one-time `code` — this route exchanges it server-side for
// a real session (setting the auth cookies via createClient's cookie
// adapter) before sending the user on to `next`.
// `next` comes from a query param an attacker could craft into the link
// they trick someone into clicking — only allow an internal path (leading
// single slash, never `//host` which browsers treat as protocol-relative)
// so this can never be turned into an open redirect to an external site.
function safeNextPath(value: string | null) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/dashboard'
  return value
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = safeNextPath(searchParams.get('next'))

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  const message = 'Este link expirou ou já foi usado. Solicite um novo.'
  return NextResponse.redirect(`${origin}/login/esqueci-senha?error=${encodeURIComponent(message)}`)
}
