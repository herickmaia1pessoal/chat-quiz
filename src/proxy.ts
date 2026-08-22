import { type NextRequest } from 'next/server'
import { updateSession } from '@/utils/supabase/middleware'

// Next.js 16 renamed the `middleware` file convention to `proxy` (same behavior,
// new name/export — see node_modules/next/dist/docs/.../proxy.md). This file was
// missing entirely, which meant Supabase's auth cookie was never refreshed on
// Server Component requests: users would get silently logged out whenever their
// access token expired mid-session, even while actively using the app.
export async function proxy(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt (metadata files)
     * - image/font/svg files
     */
    '/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
