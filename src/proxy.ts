import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Runs before every matched request. Keeps the Supabase session fresh and
// bounces logged-out visitors away from protected areas.
// (In this Next.js version this file is called `proxy`, formerly `middleware`.)
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // A transient Supabase outage/network blip here used to throw uncaught --
  // since this middleware runs on every route (including public ones), that
  // would 500 out the entire site for its duration, not just auth-dependent
  // pages. Fail toward "logged out" instead: protected paths still safely
  // redirect to login (no access granted on an auth check we couldn't
  // complete), but public pages keep working.
  let user = null
  try {
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser()
    user = authUser
  } catch {
    user = null
  }

  const path = request.nextUrl.pathname
  // /admin/login must stay reachable while logged out.
  const isAdminPath = path.startsWith('/admin') && path !== '/admin/login'
  const isProtected = path.startsWith('/dashboard') || isAdminPath

  // A Server Action call (identified by Next's own `next-action` header, not
  // a normal page navigation) must NOT be redirected from here. A bare
  // NextResponse.redirect() issued at this layer is a plain HTTP 307 -- the
  // client's action-invoking fetch doesn't expect that shape (a real in-app
  // redirect() call gets a special `x-action-redirect` response instead, see
  // Next's action-handler), so this used to surface to the user as a raw
  // client-side error instead of a clean bounce to /login -- destroying
  // whatever was in the submitted form along with it. Every action in this
  // app already does its own `if (!user) redirect(...)` check, which DOES
  // use that action-aware mechanism, so deferring to it here is both safer
  // and (per Next's own docs) the recommended pattern: proxy is for
  // optimistic checks on page loads, not the only line of defense.
  const isActionRequest = request.headers.has('next-action')

  if (!user && isProtected && !isActionRequest) {
    const url = request.nextUrl.clone()
    url.pathname = isAdminPath ? '/admin/login' : '/login'
    return NextResponse.redirect(url)
  }

  return response
}

export const config = {
  matcher: [
    // Run on everything except static assets and image files.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
