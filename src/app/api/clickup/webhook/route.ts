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
  if (!taskId || !kind) return NextResponse.json({ ok: true })

  const task = await getTask(taskId)
  if (!task) return NextResponse.json({ ok: true })

  const admin = createAdminClient()
  const { data: account } = await admin
    .from('accounts')
    .select('id')
    .eq('clickup_list_id', task.listId)
    .maybeSingle()
  if (!account) return NextResponse.json({ ok: true })

  const actor = historyItems[0]?.user?.username ?? 'Someone on the team'
  const item: BatchItem = {
    type: kind,
    detail: describeChange(kind, actor, task),
    actor,
    at: new Date().toISOString(),
    taskName: task.name,
  }

  await recordChange(account.id, taskId, CATEGORY[kind], item)
  return NextResponse.json({ ok: true })
}
