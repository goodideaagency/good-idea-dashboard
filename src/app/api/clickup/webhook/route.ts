import { NextRequest, NextResponse } from 'next/server'
import { verifyClickUpSignature } from '@/lib/clickup-webhooks'
import { getTask } from '@/lib/clickup'
import { createAdminClient } from '@/lib/supabase/admin'
import { recordChange, type BatchItem } from '@/lib/notification-batches'

const TRACKED_EVENTS: Record<string, 'comment' | 'field_change'> = {
  taskCommentPosted: 'comment',
  taskStatusUpdated: 'field_change',
  taskDueDateUpdated: 'field_change',
  taskAttachmentUpdated: 'field_change',
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function describeChange(event: string, actor: string, task: any): string {
  if (event === 'taskCommentPosted') {
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
  if (event === 'taskStatusUpdated') {
    return `${actor} changed the status to "${task.status}"`
  }
  if (event === 'taskDueDateUpdated') {
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
  const category = TRACKED_EVENTS[event]
  if (!taskId || !category) return NextResponse.json({ ok: true })

  const task = await getTask(taskId)
  if (!task) return NextResponse.json({ ok: true })

  const admin = createAdminClient()
  const { data: account } = await admin
    .from('accounts')
    .select('id')
    .eq('clickup_list_id', task.listId)
    .maybeSingle()
  if (!account) return NextResponse.json({ ok: true })

  const actor = payload.history_items?.[0]?.user?.username ?? 'Someone on the team'
  const item: BatchItem = {
    type: event,
    detail: describeChange(event, actor, task),
    actor,
    at: new Date().toISOString(),
    taskName: task.name,
  }

  await recordChange(account.id, taskId, category, item)
  return NextResponse.json({ ok: true })
}
