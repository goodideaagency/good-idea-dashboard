import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isAdmin } from '@/lib/admin-auth'

export default async function Home() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Admins go to the admin area; everyone else to their dashboard.
  // (The proxy sends logged-out visitors to the right login page.)
  if (user && (await isAdmin(user.email))) redirect('/admin')
  redirect('/dashboard')
}
