'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function setPassword(formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Must be signed in via the invite/recovery link to set a password.
  if (!user) {
    redirect('/login?error=' + encodeURIComponent('Your link has expired. Ask your admin to resend it.'))
  }

  const password = String(formData.get('password') || '')
  // Only ever set by our own routes to a relative in-app path -- reject
  // anything else so this can't be turned into an open redirect.
  const rawNext = String(formData.get('next') || '')
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/dashboard'
  const back = (error: string): never => redirect(`/set-password?next=${encodeURIComponent(next)}&error=${encodeURIComponent(error)}`)

  if (password.length < 8) back('Password must be at least 8 characters.')

  const { error } = await supabase.auth.updateUser({ password })
  if (error) back(error.message)

  revalidatePath('/', 'layout')
  redirect(next)
}
