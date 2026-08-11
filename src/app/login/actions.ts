'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isAdmin } from '@/lib/admin-auth'

export async function login(formData: FormData) {
  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({
    email: String(formData.get('email')),
    password: String(formData.get('password')),
  })

  if (error) {
    redirect('/login?error=' + encodeURIComponent(error.message))
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  revalidatePath('/', 'layout')
  // Admins land in the admin area; everyone else on their dashboard.
  if (await isAdmin(user?.email)) redirect('/admin')
  redirect('/dashboard')
}

export async function signout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/login')
}
