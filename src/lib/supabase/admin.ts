import { createClient } from '@supabase/supabase-js'

// Server-only Supabase client using the service-role key. This BYPASSES
// row-level security, so it must never be imported into client code.
// Used for trusted server writes (recording verified subscriptions) and
// the admin view (reading across all agencies).
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}
