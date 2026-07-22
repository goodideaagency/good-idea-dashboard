const BASE_URL = 'https://api.clickup.com/api/v2'

function headers() {
  return { Authorization: process.env.CLICKUP_API_TOKEN! }
}

// A comment's content, in order. ClickUp comments can mix plain text with
// inline images and file attachments, so we preserve that shape rather than
// flattening to a single string.
export type CommentSegment =
  | { type: 'text'; text: string }
  | { type: 'image'; url: string; alt: string }
  | { type: 'file'; url: string; name: string }

export type ClickUpComment = {
  id: string
  segments: CommentSegment[]
  author: string
  date: string // ISO
}

export type ClickUpAttachment = {
  id: string
  title: string
  url: string
}

export type ClickUpTask = {
  id: string
  name: string
  status: string
  statusColor: string
  dueDate: string | null // ISO
  url: string
  comments: ClickUpComment[]
  attachments: ClickUpAttachment[]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeTask(t: any): Omit<ClickUpTask, 'comments' | 'attachments'> {
  return {
    id: t.id,
    name: t.name,
    status: t.status?.status ?? 'unknown',
    statusColor: t.status?.color ?? '#87909e',
    dueDate: t.due_date ? new Date(Number(t.due_date)).toISOString() : null,
    url: t.url,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeCommentSegments(commentArr: any[]): CommentSegment[] {
  return (commentArr ?? []).map((seg) => {
    if (seg.type === 'image' && seg.image?.url) {
      return {
        type: 'image' as const,
        url: seg.image.thumbnail_large ?? seg.image.url,
        alt: seg.text ?? 'Image',
      }
    }
    if (seg.type === 'attachment' && seg.attachment?.url) {
      return { type: 'file' as const, url: seg.attachment.url, name: seg.text ?? 'Attachment' }
    }
    return { type: 'text' as const, text: seg.text ?? '' }
  })
}

async function fetchTaskComments(taskId: string): Promise<ClickUpComment[]> {
  const res = await fetch(`${BASE_URL}/task/${taskId}/comment`, { headers: headers() })
  if (!res.ok) return []
  const data = await res.json()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data.comments ?? []).map((c: any) => ({
    id: c.id,
    segments: normalizeCommentSegments(c.comment),
    author: c.user?.username ?? 'Unknown',
    date: new Date(Number(c.date)).toISOString(),
  }))
}

async function fetchTaskDetail(taskId: string): Promise<ClickUpAttachment[]> {
  const res = await fetch(`${BASE_URL}/task/${taskId}`, { headers: headers() })
  if (!res.ok) return []
  const data = await res.json()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data.attachments ?? []).map((a: any) => ({
    id: a.id,
    title: a.title ?? a.name ?? 'Attachment',
    url: a.url,
  }))
}

// Every task in a client's ClickUp List, with its comments and attachments —
// what the account's dashboard "Project" section renders. One List maps to
// one account (see accounts.clickup_list_id). Returns [] if unset or if
// ClickUp is unreachable, so a missing/broken connection never breaks the page.
export async function listTasksForAccount(listId: string): Promise<ClickUpTask[]> {
  try {
    const res = await fetch(
      `${BASE_URL}/list/${listId}/task?archived=false&include_closed=true`,
      { headers: headers() }
    )
    if (!res.ok) return []
    const data = await res.json()
    const tasks = data.tasks ?? []

    return await Promise.all(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tasks.map(async (t: any) => {
        const base = normalizeTask(t)
        const [comments, attachments] = await Promise.all([
          fetchTaskComments(t.id),
          fetchTaskDetail(t.id),
        ])
        return { ...base, comments, attachments }
      })
    )
  } catch {
    return []
  }
}

// Which List a task belongs to — used to verify a client is only ever
// commenting on a task under their OWN connected List, not one they guessed.
export async function getTaskListId(taskId: string): Promise<string | null> {
  try {
    const res = await fetch(`${BASE_URL}/task/${taskId}`, { headers: headers() })
    if (!res.ok) return null
    const data = await res.json()
    return data.list?.id ?? null
  } catch {
    return null
  }
}

// Posts a comment to a ClickUp task. Always goes through the app's single
// service token, so `authorLabel` (the platform user's own identity) is
// posted in bold on its own line above the message -- otherwise every
// comment would appear to come from whichever account owns the token, not
// the client who actually wrote it, and ClickUp's own username isn't useful
// here since it's always the same shared account.
export async function postTaskComment(taskId: string, authorLabel: string, text: string) {
  try {
    const res = await fetch(`${BASE_URL}/task/${taskId}/comment`, {
      method: 'POST',
      headers: { ...headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        comment: [
          { text: authorLabel, attributes: { bold: true } },
          { text: '\n' },
          { text },
        ],
      }),
    })
    return res.ok
  } catch {
    return false
  }
}
