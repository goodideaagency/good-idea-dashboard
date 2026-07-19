import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Supabase client for use on the server (Server Components, Server Actions,
// Route Handlers). In this Next.js version `cookies()` is async, so we await it.
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Called from a Server Component (can't set cookies there).
            // The proxy refreshes the session, so this is safe to ignore.
          }
        },
      },
    }
  )
}
