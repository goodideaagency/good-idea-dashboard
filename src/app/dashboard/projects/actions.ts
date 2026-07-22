'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getTaskListId, postTaskComment } from '@/lib/clickup'

// Posts a client's comment onto a ClickUp task, labeled with their own name
// (falling back to email if they haven't set one) so it's clear who actually
// wrote it -- the ClickUp comment itself is always authored by the app's
// shared service token. Verifies the task really belongs to the account the
// caller owns (checked via RLS + a ClickUp lookup) before posting, so a
// client can never comment on another client's task even by guessing an id.
export async function postProjectComment(formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const accountId = String(formData.get('account_id') || '').trim()
  const taskId = String(formData.get('task_id') || '').trim()
  const text = String(formData.get('text') || '').trim()
  if (!accountId || !taskId || !text) redirect('/dashboard/projects')

  // RLS ensures this only returns the account if it belongs to the caller's agency.
  const { data: account } = await supabase
    .from('accounts')
    .select('id, clickup_list_id')
    .eq('id', accountId)
    .maybeSingle<{ id: string; clickup_list_id: string | null }>()
  if (!account?.clickup_list_id) redirect('/dashboard/projects')

  const taskListId = await getTaskListId(taskId)
  if (taskListId !== account.clickup_list_id) redirect(`/dashboard/projects/${taskId}`)

  const authorName = (user.user_metadata as { full_name?: string })?.full_name
  await postTaskComment(taskId, authorName || user.email || 'Client', text)
  revalidatePath(`/dashboard/projects/${taskId}`)
}
