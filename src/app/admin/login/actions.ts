'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isAdmin } from '@/lib/admin-auth'

export async function adminLogin(formData: FormData) {
  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({
    email: String(formData.get('email')),
    password: String(formData.get('password')),
  })

  if (error) {
    redirect('/admin/login?error=' + encodeURIComponent(error.message))
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Only approved admins may use this entrance. Others are signed back out.
  if (!(await isAdmin(user?.email))) {
    await supabase.auth.signOut()
    redirect(
      '/admin/login?error=' +
        encodeURIComponent('That account does not have admin access.')
    )
  }

  revalidatePath('/', 'layout')
  redirect('/admin')
}
