'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getTaskListId, postTaskComment, setTaskStatus } from '@/lib/clickup'

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

  // Dropped BEFORE posting so the webhook (which fires almost immediately)
  // can recover who really wrote this -- every platform-posted comment goes
  // through one shared ClickUp bot account, so ClickUp's own event has no
  // way to tell us that itself. Lets the notification pipeline skip
  // telling this exact person about their own comment.
  const admin = createAdminClient()
  await admin.from('platform_comment_markers').insert({ task_id: taskId, user_id: user.id })

  const authorName = (user.user_metadata as { full_name?: string })?.full_name
  const posted = await postTaskComment(taskId, authorName || user.email || 'Client', text)
  if (!posted) {
    // Was silently discarded before -- the client would see their comment
    // "post" successfully while it never actually reached ClickUp, with no
    // way to know it needed retrying.
    redirect(
      `/dashboard/projects/${taskId}?error=` +
        encodeURIComponent('Could not post your comment. Please try again.')
    )
  }
  revalidatePath(`/dashboard/projects/${taskId}`)
}

// Reopens a completed project back to "scoping" so the team sees it needs
// attention again. Same ownership check as postProjectComment -- the task's
// own List must belong to the caller's agency.
export async function reopenProject(formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const accountId = String(formData.get('account_id') || '').trim()
  const taskId = String(formData.get('task_id') || '').trim()
  if (!accountId || !taskId) redirect('/dashboard/projects')

  // RLS ensures this only returns the account if it belongs to the caller's agency.
  const { data: account } = await supabase
    .from('accounts')
    .select('id, clickup_list_id')
    .eq('id', accountId)
    .maybeSingle<{ id: string; clickup_list_id: string | null }>()
  if (!account?.clickup_list_id) redirect('/dashboard/projects')

  const taskListId = await getTaskListId(taskId)
  if (taskListId !== account.clickup_list_id) redirect(`/dashboard/projects/${taskId}`)

  const reopened = await setTaskStatus(taskId, 'scoping')
  if (!reopened) {
    redirect(
      `/dashboard/projects/${taskId}?error=` +
        encodeURIComponent('Could not reopen this project. Please try again.')
    )
  }
  revalidatePath(`/dashboard/projects/${taskId}`)
  revalidatePath('/dashboard/projects')
  revalidatePath('/dashboard')
}
