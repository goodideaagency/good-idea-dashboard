import { createAdminClient } from './supabase/admin'
import { scheduleFlush } from './qstash'
import { sendNotificationEmail } from './resend'

export type BatchItem = {
  type: string // 'comment' | 'taskStatusUpdated' | 'taskDueDateUpdated' | 'taskAttachmentUpdated'
  detail: string
  actor: string
  at: string // ISO
  taskName: string
}

const COMMENT_WINDOW_SECONDS = 2 * 60
const FIELD_CHANGE_WINDOW_SECONDS = 60 * 60

// Adds a change to a task's open batch (comment or field_change), creating a
// new one -- and scheduling its flush -- if none is currently open. The
// window is fixed at open time (not a sliding debounce), so a task with
// continuous activity still flushes on schedule instead of never.
export async function recordChange(
  accountId: string,
  taskId: string,
  category: 'comment' | 'field_change',
  item: BatchItem
): Promise<void> {
  const admin = createAdminClient()

  const { data: existing } = await admin
    .from('notification_batches')
    .select('id, items')
    .eq('task_id', taskId)
    .eq('category', category)
    .is('sent_at', null)
    .maybeSingle()

  if (existing) {
    await admin
      .from('notification_batches')
      .update({ items: [...(existing.items as BatchItem[]), item] })
      .eq('id', existing.id)
    return
  }

  const windowSeconds = category === 'comment' ? COMMENT_WINDOW_SECONDS : FIELD_CHANGE_WINDOW_SECONDS
  const firesAt = new Date(Date.now() + windowSeconds * 1000).toISOString()

  const { data: created, error } = await admin
    .from('notification_batches')
    .insert({ account_id: accountId, task_id: taskId, category, items: [item], fires_at: firesAt })
    .select('id')
    .single()

  if (error) {
    // Lost the race against a concurrent webhook event opening the same
    // batch -- fall back to appending to whatever it created.
    const { data: raceWinner } = await admin
      .from('notification_batches')
      .select('id, items')
      .eq('task_id', taskId)
      .eq('category', category)
      .is('sent_at', null)
      .maybeSingle()
    if (raceWinner) {
      await admin
        .from('notification_batches')
        .update({ items: [...(raceWinner.items as BatchItem[]), item] })
        .eq('id', raceWinner.id)
    }
    return
  }

  if (created) await scheduleFlush(created.id, windowSeconds)
}

function summarize(category: string, items: BatchItem[]) {
  const taskName = items[0]?.taskName ?? 'a task'
  if (category === 'comment') {
    return items.length === 1
      ? `New comment on ${taskName}`
      : `${items.length} new comments on ${taskName}`
  }
  return items.length === 1 ? `Update on ${taskName}` : `${items.length} updates on ${taskName}`
}

function renderEmailHtml(title: string, items: BatchItem[], url: string) {
  const lines = items.map((i) => `<li>${i.detail}</li>`).join('')
  return `<p><strong>${title}</strong></p><ul>${lines}</ul><p><a href="${url}">View in dashboard</a></p>`
}

// Called by the scheduled QStash callback once a batch's window has closed.
// Fans the batch out into one notification per user in the owning agency,
// sends the accompanying email, and marks the batch sent. No-ops if the
// batch is missing, already sent, or (race) ended up empty.
export async function flushBatch(batchId: string): Promise<void> {
  const admin = createAdminClient()

  const { data: batch } = await admin
    .from('notification_batches')
    .select('id, account_id, task_id, category, items, sent_at')
    .eq('id', batchId)
    .maybeSingle()
  if (!batch || batch.sent_at) return

  const items = batch.items as BatchItem[]
  if (items.length === 0) {
    await admin.from('notification_batches').update({ sent_at: new Date().toISOString() }).eq('id', batchId)
    return
  }

  const { data: account } = await admin
    .from('accounts')
    .select('id, name, agency_id')
    .eq('id', batch.account_id)
    .maybeSingle()
  if (!account) return

  const { data: agencyUsers } = await admin
    .from('agency_users')
    .select('user_id')
    .eq('agency_id', account.agency_id)
  const userIds = (agencyUsers ?? []).map((u) => u.user_id)

  const title = summarize(batch.category, items)
  const body = items.map((i) => i.detail).join('\n')
  const url = `/dashboard/projects/${batch.task_id}`
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''

  if (userIds.length > 0) {
    await admin.from('notifications').insert(
      userIds.map((uid) => ({
        user_id: uid,
        agency_id: account.agency_id,
        account_id: account.id,
        task_id: batch.task_id,
        title,
        body,
        url,
      }))
    )

    const html = renderEmailHtml(title, items, `${appUrl}${url}`)
    await Promise.all(
      userIds.map(async (uid) => {
        const { data } = await admin.auth.admin.getUserById(uid)
        const email = data?.user?.email
        if (email) await sendNotificationEmail(email, title, html)
      })
    )
  }

  await admin.from('notification_batches').update({ sent_at: new Date().toISOString() }).eq('id', batchId)
}
