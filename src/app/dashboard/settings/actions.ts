'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function updateName(formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const name = String(formData.get('name') || '').trim()
  if (!name) {
    redirect('/dashboard/settings?error=' + encodeURIComponent('Please enter your name.'))
  }

  const { error } = await supabase.auth.updateUser({ data: { full_name: name } })
  if (error) {
    redirect('/dashboard/settings?error=' + encodeURIComponent(error.message))
  }

  revalidatePath('/', 'layout')
  redirect('/dashboard/settings?saved=name')
}

export async function updateEmail(formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const email = String(formData.get('email') || '').trim()
  if (!email) {
    redirect('/dashboard/settings?error=' + encodeURIComponent('Please enter an email address.'))
  }

  const { error } = await supabase.auth.updateUser({ email })
  if (error) {
    redirect('/dashboard/settings?error=' + encodeURIComponent(error.message))
  }

  // Supabase sends confirmation link(s) before the change actually takes
  // effect -- the address only updates once the client clicks through.
  redirect('/dashboard/settings?saved=email')
}

export async function updatePassword(formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const password = String(formData.get('password') || '')
  if (password.length < 8) {
    redirect(
      '/dashboard/settings?error=' + encodeURIComponent('Password must be at least 8 characters.')
    )
  }

  const { error } = await supabase.auth.updateUser({ password })
  if (error) {
    redirect('/dashboard/settings?error=' + encodeURIComponent(error.message))
  }

  redirect('/dashboard/settings?saved=password')
}
