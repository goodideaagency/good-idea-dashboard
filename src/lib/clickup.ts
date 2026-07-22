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

// The lightweight fields needed for list/table views (Dashboard, Projects) —
// no comments or attachments, so fetching many of these at once stays cheap.
export type ClickUpTaskSummary = {
  id: string
  name: string
  status: string
  statusColor: string
  dueDate: string | null // ISO
  url: string
  listId: string
  assignees: string[]
}

export type ClickUpTask = ClickUpTaskSummary & {
  comments: ClickUpComment[]
  attachments: ClickUpAttachment[]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeTask(t: any): ClickUpTaskSummary {
  return {
    id: t.id,
    name: t.name,
    status: t.status?.status ?? 'unknown',
    statusColor: t.status?.color ?? '#87909e',
    dueDate: t.due_date ? new Date(Number(t.due_date)).toISOString() : null,
    url: t.url,
    listId: t.list?.id ?? '',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    assignees: (t.assignees ?? []).map((a: any) => a.username).filter(Boolean),
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeAttachments(attachments: any[]): ClickUpAttachment[] {
  return (attachments ?? []).map((a) => ({
    id: a.id,
    title: a.title ?? a.name ?? 'Attachment',
    url: a.url,
  }))
}

// Every task in a client's ClickUp List, WITHOUT comments/attachments — for
// list/table views (Dashboard, Projects) where fetching dozens of tasks at
// once needs to stay cheap. Returns [] if unset or ClickUp is unreachable.
export async function listTaskSummariesForAccount(
  listId: string
): Promise<ClickUpTaskSummary[]> {
  try {
    const res = await fetch(
      `${BASE_URL}/list/${listId}/task?archived=false&include_closed=true`,
      { headers: headers() }
    )
    if (!res.ok) return []
    const data = await res.json()
    return (data.tasks ?? []).map(normalizeTask)
  } catch {
    return []
  }
}

// Every task in a client's ClickUp List, WITH comments and attachments — what
// an account's Project section used to render inline. One List maps to one
// account (see accounts.clickup_list_id).
export async function listTasksForAccount(listId: string): Promise<ClickUpTask[]> {
  const summaries = await listTaskSummariesForAccount(listId)
  return Promise.all(
    summaries.map(async (base) => {
      const [comments, detail] = await Promise.all([
        fetchTaskComments(base.id),
        fetch(`${BASE_URL}/task/${base.id}`, { headers: headers() })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
      ])
      return { ...base, comments, attachments: normalizeAttachments(detail?.attachments) }
    })
  )
}

// A single task by id, with comments and attachments — the Projects detail
// page. Returns null if the task doesn't exist or ClickUp is unreachable.
export async function getTask(taskId: string): Promise<ClickUpTask | null> {
  try {
    const res = await fetch(`${BASE_URL}/task/${taskId}`, { headers: headers() })
    if (!res.ok) return null
    const data = await res.json()
    const comments = await fetchTaskComments(taskId)
    return { ...normalizeTask(data), comments, attachments: normalizeAttachments(data.attachments) }
  } catch {
    return null
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

// One question on an intake form -- backed by a ClickUp List's Custom Field,
// fetched dynamically so the team can add/edit/remove questions in ClickUp
// without any code change on our end.
export type ClickUpFieldOption = { id: string; name: string }
export type ClickUpField = {
  id: string
  name: string
  type: string // 'text' | 'url' | 'number' | 'date' | 'checkbox' | 'drop_down' | ...
  options: ClickUpFieldOption[]
}

// The intake-question schema for a service's List (its Custom Fields).
export async function getListFields(listId: string): Promise<ClickUpField[]> {
  try {
    const res = await fetch(`${BASE_URL}/list/${listId}/field`, { headers: headers() })
    if (!res.ok) return []
    const data = await res.json()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data.fields ?? []).map((f: any) => ({
      id: f.id,
      name: f.name,
      type: f.type,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      options: (f.type_config?.options ?? []).map((o: any) => ({ id: o.id, name: o.name })),
    }))
  } catch {
    return []
  }
}

// Creates a task in a List, optionally with a starting status and Custom
// Field answers (from a submitted intake form). Returns null on failure.
export async function createTask(
  listId: string,
  name: string,
  opts: { status?: string; customFields?: { id: string; value: unknown }[] } = {}
): Promise<{ id: string; url: string } | null> {
  try {
    const res = await fetch(`${BASE_URL}/list/${listId}/task`, {
      method: 'POST',
      headers: { ...headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        ...(opts.status ? { status: opts.status } : {}),
        ...(opts.customFields ? { custom_fields: opts.customFields } : {}),
      }),
    })
    if (!res.ok) return null
    const data = await res.json()
    return { id: data.id, url: data.url }
  } catch {
    return null
  }
}

// Creates a task from a saved ClickUp Task Template (checklist, description,
// etc. all come from the template) -- note the template-creation endpoint
// ignores a custom_fields body param, so answers must be set afterward via
// setTaskCustomField, one call per field.
export async function createTaskFromTemplate(
  listId: string,
  templateId: string,
  name: string
): Promise<{ id: string; url: string } | null> {
  try {
    const res = await fetch(`${BASE_URL}/list/${listId}/taskTemplate/${templateId}`, {
      method: 'POST',
      headers: { ...headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    if (!res.ok) return null
    const data = await res.json()
    const id = data.id ?? data.task?.id
    const url = data.url ?? data.task?.url ?? ''
    return id ? { id, url } : null
  } catch {
    return null
  }
}

// Sets one Custom Field's value on an existing task.
export async function setTaskCustomField(
  taskId: string,
  fieldId: string,
  value: unknown
): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/task/${taskId}/field/${fieldId}`, {
      method: 'POST',
      headers: { ...headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ value }),
    })
    return res.ok
  } catch {
    return false
  }
}

// Links two tasks together (ClickUp's native task-relationship feature) --
// used to connect a client-facing task to its paired internal task.
export async function linkTasks(taskIdA: string, taskIdB: string): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/task/${taskIdA}/link/${taskIdB}`, {
      method: 'POST',
      headers: headers(),
    })
    return res.ok
  } catch {
    return false
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
