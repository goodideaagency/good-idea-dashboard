'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

// RLS scopes this to the caller's own notifications already. Marking a
// single notification read happens via /api/notifications/open/[id] instead
// (a plain link, so it works with no client JS).
export async function markAllNotificationsRead() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return
  await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .is('read_at', null)
  revalidatePath('/dashboard', 'layout')
}

// Puts a single notification back into the unread state -- e.g. you opened
// it, but haven't actually dealt with it yet and want it to keep showing as
// outstanding. eq('user_id', ...) is belt-and-suspenders on top of RLS, same
// as markAllNotificationsRead.
export async function markNotificationUnread(formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return

  const notificationId = String(formData.get('notification_id') || '').trim()
  if (!notificationId) return

  await supabase
    .from('notifications')
    .update({ read_at: null })
    .eq('id', notificationId)
    .eq('user_id', user.id)
  revalidatePath('/dashboard/notifications')
  revalidatePath('/dashboard', 'layout')
}
