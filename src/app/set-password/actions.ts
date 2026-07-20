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
  if (password.length < 8) {
    redirect('/set-password?error=' + encodeURIComponent('Password must be at least 8 characters.'))
  }

  const { error } = await supabase.auth.updateUser({ password })
  if (error) {
    redirect('/set-password?error=' + encodeURIComponent(error.message))
  }

  revalidatePath('/', 'layout')
  redirect('/dashboard')
}
