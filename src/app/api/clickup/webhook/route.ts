import { NextRequest, NextResponse } from 'next/server'
import { verifyClickUpSignature } from '@/lib/clickup-webhooks'
import { getTask } from '@/lib/clickup'
import { createAdminClient } from '@/lib/supabase/admin'
import { recordChange, type BatchItem } from '@/lib/notification-batches'

// ClickUp has no dedicated "attachment added" event -- it folds into the
// generic taskUpdated event instead, so we only treat a taskUpdated payload
// as notification-worthy when one of its history_items is actually an
// attachment change (otherwise every minor edit -- name, description,
// priority, etc. -- would fire a notification).
type Kind = 'comment' | 'status' | 'due_date' | 'attachment'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resolveKind(event: string, historyItems: any[]): Kind | null {
  if (event === 'taskCommentPosted') return 'comment'
  if (event === 'taskStatusUpdated') return 'status'
  if (event === 'taskDueDateUpdated') return 'due_date'
  if (event === 'taskUpdated') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hasAttachment = historyItems.some((h: any) => h.field === 'attachment')
    return hasAttachment ? 'attachment' : null
  }
  return null
}

const CATEGORY: Record<Kind, 'comment' | 'field_change'> = {
  comment: 'comment',
  status: 'field_change',
  due_date: 'field_change',
  attachment: 'field_change',
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function describeChange(kind: Kind, actor: string, task: any): string {
  if (kind === 'comment') {
    const latest = [...task.comments].sort((a: { date: string }, b: { date: string }) =>
      b.date.localeCompare(a.date)
    )[0]
    const text = (latest?.segments ?? [])
      .filter((s: { type: string }) => s.type === 'text')
      .map((s: { text: string }) => s.text)
      .join('')
      .trim()
    return `${actor} commented${text ? `: "${text.slice(0, 200)}"` : ''}`
  }
  if (kind === 'status') {
    return `${actor} changed the status to "${task.status}"`
  }
  if (kind === 'due_date') {
    return `${actor} updated the due date${
      task.dueDate ? ` to ${new Date(task.dueDate).toLocaleDateString()}` : ''
    }`
  }
  return `${actor} added a new file`
}

// Receives every task change ClickUp fires for the "Good Idea Clients" Space
// (see registerSpaceWebhook). Only changes on a task belonging to a List
// we've linked to an account (accounts.clickup_list_id) turn into a
// notification -- this is what naturally excludes internal-only tasks, since
// Internal Ops lives in a separate, unregistered Space.
export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const signature = req.headers.get('x-signature')
  if (!verifyClickUpSignature(rawBody, signature)) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let payload: any
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ ok: true })
  }

  const event = payload.event as string
  const taskId = payload.task_id as string | undefined
  const historyItems = payload.history_items ?? []
  const kind = resolveKind(event, historyItems)
  // TEMP DIAGNOSTIC (2026-08-13): confirming which deliveries actually reach
  // recordChange -- remove once root-caused.
  console.log('[client-webhook]', JSON.stringify({ event, kind, historyItemFields: historyItems.map((h: { field?: string }) => h.field) }))
  if (!taskId || !kind) return NextResponse.json({ ok: true })

  try {
    // null here means the task genuinely doesn't exist (a real 404, e.g. it
    // was deleted moments after this event fired) -- any other ClickUp
    // failure now throws instead (see getTask), caught below so it returns
    // a real error status and ClickUp retries the delivery, rather than
    // this reporting success and permanently losing the notification.
    const task = await getTask(taskId)
    if (!task) return NextResponse.json({ ok: true })

    const admin = createAdminClient()
    const { data: account } = await admin
      .from('accounts')
      .select('id')
      .eq('clickup_list_id', task.listId)
      .maybeSingle()
    if (!account) return NextResponse.json({ ok: true })

    // Comments and attachments are the two kinds the platform itself can
    // post (always through one shared ClickUp bot account) -- check for a
    // recent marker to recover which real agency user it actually was, so
    // the notification pipeline can skip telling them about their own
    // comment (see platform_comment_markers) and so the activity text
    // names the actual person instead of the bot.
    let actor = historyItems[0]?.user?.username ?? 'Someone on the team'
    let authorUserId: string | undefined
    if (kind === 'comment' || kind === 'attachment') {
      const { data: marker } = await admin
        .from('platform_comment_markers')
        .select('user_id')
        .eq('task_id', taskId)
        .gte('created_at', new Date(Date.now() - 2 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (marker) {
        authorUserId = marker.user_id
        const { data } = await admin.auth.admin.getUserById(marker.user_id)
        const name = (data?.user?.user_metadata as { full_name?: string })?.full_name
        actor = name || data?.user?.email || actor
      }
    }

    const item: BatchItem = {
      type: kind,
      detail: describeChange(kind, actor, task),
      actor,
      at: new Date().toISOString(),
      taskName: task.name,
      authorUserId,
    }

    await recordChange(account.id, taskId, CATEGORY[kind], item)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('ClickUp webhook handler error:', err)
    return new NextResponse('Handler error', { status: 500 })
  }
}
