const BASE_URL = 'https://api.clickup.com/api/v2'

function headers() {
  return { Authorization: process.env.CLICKUP_API_TOKEN! }
}

// A comment's content, in order. ClickUp comments can mix plain text with
// inline images and file attachments, so we preserve that shape rather than
// flattening to a single string.
export type CommentSegment =
  | { type: 'text'; text: string; bold?: boolean }
  | { type: 'file'; id: string; url: string; name: string; extension: string | null; thumbnail: string | null }

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
  extension: string | null
  // A ready-to-use image thumbnail URL -- ClickUp only populates this for
  // image attachments (null for everything else, e.g. PDFs, docs), which is
  // exactly the signal used to decide "show a thumbnail" vs "show a file
  // type icon."
  thumbnail: string | null
}

// The lightweight fields needed for list/table views (Dashboard, Projects) —
// no comments or attachments, so fetching many of these at once stays cheap.
export type ClickUpTaskSummary = {
  id: string
  name: string
  status: string
  statusColor: string
  dueDate: string | null // ISO
  dateCreated: string | null // ISO
  url: string
  listId: string
  assignees: string[]
}

export type ClickUpTask = ClickUpTaskSummary & {
  comments: ClickUpComment[]
  attachments: ClickUpAttachment[]
  // Markdown-flavored text, as authored in ClickUp's own rich text editor
  // (bold, links, lists, etc.) -- null/empty when the task has no
  // description at all, which callers should treat as "nothing to show"
  // rather than rendering an empty block.
  description: string | null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeTask(t: any): ClickUpTaskSummary {
  return {
    id: t.id,
    name: t.name,
    status: t.status?.status ?? 'unknown',
    statusColor: t.status?.color ?? '#87909e',
    dueDate: t.due_date ? new Date(Number(t.due_date)).toISOString() : null,
    dateCreated: t.date_created ? new Date(Number(t.date_created)).toISOString() : null,
    url: t.url,
    listId: t.list?.id ?? '',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    assignees: (t.assignees ?? []).map((a: any) => a.username).filter(Boolean),
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeCommentSegments(commentArr: any[]): CommentSegment[] {
  return (commentArr ?? []).map((seg) => {
    // ClickUp's own editor can embed a directly-pasted image via a distinct
    // 'image' segment shape (no id/extension, just a url) -- everything
    // uploaded through this platform's own upload flow comes back as
    // 'attachment' instead, image or not (confirmed live), which is why
    // that branch below carries the real extension/thumbnail fields.
    if (seg.type === 'image' && seg.image?.url) {
      return {
        type: 'file' as const,
        id: seg.image.url,
        url: seg.image.url,
        name: seg.text ?? 'Image',
        extension: null,
        thumbnail: seg.image.thumbnail_large ?? seg.image.url,
      }
    }
    if (seg.type === 'attachment' && seg.attachment?.url) {
      return {
        type: 'file' as const,
        id: seg.attachment.id,
        url: seg.attachment.url,
        name: seg.text ?? seg.attachment.title ?? 'Attachment',
        extension: seg.attachment.extension ?? null,
        thumbnail: seg.attachment.thumbnail_medium ?? seg.attachment.thumbnail_small ?? null,
      }
    }
    return { type: 'text' as const, text: seg.text ?? '', bold: seg.attributes?.bold === true }
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
    extension: a.extension ?? null,
    thumbnail: a.thumbnail_medium ?? a.thumbnail_small ?? null,
  }))
}

// Every task in a client's ClickUp List, WITHOUT comments/attachments — for
// list/table views (Dashboard, Projects) where fetching dozens of tasks at
// once needs to stay cheap. Returns [] if unset or ClickUp is unreachable.
// Throws on any ClickUp failure instead of swallowing it to [] -- an empty
// array used to mean either "this account genuinely has zero tasks" or
// "ClickUp errored/is unreachable," indistinguishably. Callers should catch
// this per-account (see listProjectTasksForAgency) rather than let one
// failure blank out everything else.
export async function listTaskSummariesForAccount(
  listId: string
): Promise<ClickUpTaskSummary[]> {
  const res = await fetch(`${BASE_URL}/list/${listId}/task?archived=false&include_closed=true`, {
    headers: headers(),
  })
  if (!res.ok) throw new Error(`ClickUp listTaskSummariesForAccount ${listId} failed: HTTP ${res.status}`)
  const data = await res.json()
  return (data.tasks ?? []).map(normalizeTask)
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
      return {
        ...base,
        comments,
        attachments: normalizeAttachments(detail?.attachments),
        description: detail?.description || null,
      }
    })
  )
}

// A single task by id, with comments and attachments — the Projects detail
// page. Returns null only when the task genuinely doesn't exist (a real 404) --
// any other failure (ClickUp down, rate-limited, network error) THROWS
// instead of also returning null. Callers used to be unable to tell "this
// task is really gone" apart from "ClickUp is having a moment" -- both
// looked identical, which meant transient failures silently rendered as
// empty states or bounced users away with no explanation. Callers should
// catch this and show/report the failure rather than treating it as absence.
export async function getTask(taskId: string): Promise<ClickUpTask | null> {
  // A common caller pattern is redirecting straight here right after
  // creating the task -- a brief ClickUp consistency lag or rate-limit
  // blip at that exact moment used to throw immediately and crash the page
  // the user just landed on, confirmed live. One quick retry absorbs that
  // without giving up the real signal (a genuine failure still throws).
  for (const delayMs of [0, 800]) {
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs))
    const res = await fetch(`${BASE_URL}/task/${taskId}`, { headers: headers() })
    if (res.status === 404) return null
    if (res.ok) {
      const data = await res.json()
      const comments = await fetchTaskComments(taskId)
      return {
        ...normalizeTask(data),
        comments,
        attachments: normalizeAttachments(data.attachments),
        description: data.description || null,
      }
    }
  }
  throw new Error(`ClickUp getTask ${taskId} failed after retry`)
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
      // "labels" (multi-select) options come back as { label } instead of
      // { name } -- normalized here so callers only ever deal with `.name`.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      options: (f.type_config?.options ?? []).map((o: any) => ({ id: o.id, name: o.name ?? o.label })),
    }))
  } catch {
    return []
  }
}

// Every newly created task is assigned to this ClickUp user by default (a
// comma-separated list of ClickUp user ids) -- currently the single "bot"
// account tasks get created and commented under, so nothing is ever left
// unassigned. As real team members get their own ClickUp seats, reassign
// individual tasks in ClickUp, or change this env var to spread new tasks
// across people going forward.
function defaultAssignees(): number[] {
  return (process.env.CLICKUP_DEFAULT_ASSIGNEE_ID ?? '')
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => !Number.isNaN(n) && n > 0)
}

// Creates a task in a List, optionally with a starting status, description,
// and Custom Field answers (from a submitted intake form). Returns null on failure.
export async function createTask(
  listId: string,
  name: string,
  opts: {
    status?: string
    description?: string
    markdownDescription?: string
    customFields?: { id: string; value: unknown }[]
  } = {}
): Promise<{ id: string; url: string } | null> {
  try {
    const assignees = defaultAssignees()
    const res = await fetch(`${BASE_URL}/list/${listId}/task`, {
      method: 'POST',
      headers: { ...headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        ...(opts.status ? { status: opts.status } : {}),
        // markdown_description renders real headers/bold in ClickUp's UI --
        // preferred over plain description whenever we have structured
        // content (e.g. a grouped intake-answers summary) worth formatting.
        ...(opts.markdownDescription
          ? { markdown_description: opts.markdownDescription }
          : opts.description
            ? { description: opts.description }
            : {}),
        ...(opts.customFields ? { custom_fields: opts.customFields } : {}),
        ...(assignees.length > 0 ? { assignees } : {}),
      }),
    })
    if (!res.ok) return null
    const data = await res.json()
    return { id: data.id, url: data.url }
  } catch {
    return null
  }
}

// Deletes a task -- used to clean up an internal-ops task created just
// before a credit spend that then failed (a real race with the balance
// pre-check), so a losing request doesn't leave a stray unpaid task behind.
export async function deleteTask(taskId: string): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/task/${taskId}`, { method: 'DELETE', headers: headers() })
    return res.ok
  } catch {
    return false
  }
}

// Adds assignees to an existing task -- used after template-based creation,
// since that endpoint (like custom_fields) ignores an inline assignees param.
export async function assignTask(taskId: string, userIds: number[]): Promise<boolean> {
  if (userIds.length === 0) return true
  try {
    const res = await fetch(`${BASE_URL}/task/${taskId}`, {
      method: 'PUT',
      headers: { ...headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignees: { add: userIds, rem: [] } }),
    })
    return res.ok
  } catch {
    return false
  }
}

// Sets an existing task's description from markdown -- same follow-up-call
// need as assignTask, for template-based creation (which likely ignores an
// inline description the same way it ignores custom_fields/assignees).
export async function updateTaskMarkdownDescription(
  taskId: string,
  markdown: string
): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/task/${taskId}`, {
      method: 'PUT',
      headers: { ...headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ markdown_description: markdown }),
    })
    return res.ok
  } catch {
    return false
  }
}

// Creates a new Folder inside a Space -- used to auto-provision a brand-new
// agency's own Folder (which every one of its client Lists then lives under)
// the moment they sign up.
export async function createFolder(spaceId: string, name: string): Promise<{ id: string } | null> {
  try {
    const res = await fetch(`${BASE_URL}/space/${spaceId}/folder`, {
      method: 'POST',
      headers: { ...headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.id ? { id: data.id } : null
  } catch {
    return null
  }
}

// Creates a new List inside a Folder -- used to auto-provision a brand-new
// client's own List the moment their Client Profile is created.
export async function createList(folderId: string, name: string): Promise<{ id: string } | null> {
  try {
    const res = await fetch(`${BASE_URL}/folder/${folderId}/list`, {
      method: 'POST',
      headers: { ...headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.id ? { id: data.id } : null
  } catch {
    return null
  }
}

// Creates a task from a saved ClickUp Task Template (checklist, description,
// etc. all come from the template) -- note the template-creation endpoint
// ignores both a custom_fields AND an assignees body param, so both must be
// set afterward (see setTaskCustomField / assignTask).
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
    if (id) await assignTask(id, defaultAssignees())
    return id ? { id, url } : null
  } catch {
    return null
  }
}

// Ensures a List has a "Client Status" dropdown Custom Field (Active /
// Archived), creating it the first time it's needed rather than requiring
// every agency's Client Profiles list to be pre-configured by hand.
// Idempotent: a second call just finds the field that's already there.
export async function ensureClientStatusField(
  listId: string
): Promise<{ fieldId: string; activeIndex: number; archivedIndex: number } | null> {
  const indicesFrom = (options: { name?: string; label?: string; orderindex: number }[]) => {
    const activeIndex = options.find((o) => (o.name ?? o.label) === 'Active')?.orderindex
    const archivedIndex = options.find((o) => (o.name ?? o.label) === 'Archived')?.orderindex
    return activeIndex !== undefined && archivedIndex !== undefined ? { activeIndex, archivedIndex } : null
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const findExisting = async (): Promise<{ fieldId: string; activeIndex: number; archivedIndex: number } | null> => {
    try {
      const res = await fetch(`${BASE_URL}/list/${listId}/field`, { headers: headers() })
      if (!res.ok) return null
      const data = await res.json()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const matches = (data.fields ?? []).filter((f: any) => f.name === 'Client Status' && f.type === 'drop_down')
      if (matches.length === 0) return null
      // Two concurrent first-ever calls for the same List could each create
      // their own copy of this field before seeing the other's -- if that
      // ever happens, always converge on the same one (lowest id) instead of
      // whatever order the API happens to return, so status writes don't
      // silently split across two fields.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const field = matches.sort((a: any, b: any) => (a.id < b.id ? -1 : 1))[0]
      const indices = indicesFrom(field.type_config?.options ?? [])
      return indices ? { fieldId: field.id, ...indices } : null
    } catch {
      return null
    }
  }

  const existing = await findExisting()
  if (existing) return existing

  try {
    const res = await fetch(`${BASE_URL}/list/${listId}/field`, {
      method: 'POST',
      headers: { ...headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Client Status',
        type: 'drop_down',
        type_config: { options: [{ name: 'Active' }, { name: 'Archived' }] },
      }),
    })
    if (res.ok) {
      const data = await res.json()
      const indices = indicesFrom(data.type_config?.options ?? [])
      if (indices) return { fieldId: data.id, ...indices }
    }
  } catch {
    // fall through to the lookup below -- another concurrent call may have
    // created it, or ClickUp may just need a moment (see comment below).
  }

  // Either the create response didn't come back with usable option data yet
  // (confirmed live: ClickUp needs a moment before a brand-new field is
  // fully readable) or a concurrent call created it first -- look it up
  // fresh instead of leaving this client with no status at all.
  await new Promise((resolve) => setTimeout(resolve, 1000))
  return findExisting()
}

// Sets a Client Profile task's Client Status field to Active or Archived,
// creating the field on its List the first time it's needed. When that
// first creation just happened, setting a value on it right away can 404 --
// confirmed live, ClickUp needs a moment before a brand-new field is usable
// -- so this retries once after a short delay rather than silently leaving
// an agency's very first client with a blank status.
export async function setClientStatus(
  profilesListId: string,
  profileTaskId: string,
  archived: boolean
): Promise<boolean> {
  const field = await ensureClientStatusField(profilesListId)
  if (!field) return false
  const value = archived ? field.archivedIndex : field.activeIndex
  for (const delayMs of [0, 1500, 4000]) {
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs))
    if (await setTaskCustomField(profileTaskId, field.fieldId, value)) return true
  }
  return false
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

// Uploads a file as an attachment on a task -- used for a Client Profile's
// "Files" section, so brand assets/documents land directly on the profile
// task in ClickUp where the team already works, instead of a separate store.
// Note: ClickUp's API has no attachment-delete endpoint, so removal has to
// happen in ClickUp directly.
export async function uploadTaskAttachment(
  taskId: string,
  file: Blob,
  filename: string
): Promise<ClickUpAttachment | null> {
  try {
    const form = new FormData()
    form.append('attachment', file, filename)
    const res = await fetch(`${BASE_URL}/task/${taskId}/attachment`, {
      method: 'POST',
      headers: headers(),
      body: form,
    })
    if (!res.ok) return null
    const data = await res.json()
    return {
      id: data.id,
      title: data.title ?? data.name ?? filename,
      url: data.url,
      extension: data.extension ?? null,
      thumbnail: data.thumbnail_medium ?? data.thumbnail_small ?? null,
    }
  } catch {
    return null
  }
}

// Posts a comment embedding an already-uploaded attachment, with the
// uploader's name in bold -- same "who really did this" problem as
// postTaskComment (every upload goes through the shared bot account), but
// for files instead of text. The attachment segment renders as a real
// inline file/thumbnail in ClickUp, not just a link.
export async function postAttachmentComment(
  taskId: string,
  authorLabel: string,
  attachmentId: string
): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/task/${taskId}/comment`, {
      method: 'POST',
      headers: { ...headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        comment: [
          { text: authorLabel, attributes: { bold: true } },
          { text: '\n' },
          { text: 'uploaded a file' },
          { type: 'attachment', attachment: { id: attachmentId } },
        ],
      }),
    })
    return res.ok
  } catch {
    return false
  }
}

// Same idea as postAttachmentComment, but for the project comment box, where
// the user may have typed a real message alongside the file instead of just
// "uploaded a file" -- posts both as one ClickUp comment so it doesn't show
// as two separate messages. `text` may be empty (attach-only, no caption).
export async function postTaskCommentWithAttachment(
  taskId: string,
  authorLabel: string,
  text: string,
  attachmentId: string
): Promise<boolean> {
  try {
    const comment: unknown[] = [{ text: authorLabel, attributes: { bold: true } }, { text: '\n' }]
    if (text) comment.push({ text })
    comment.push({ type: 'attachment', attachment: { id: attachmentId } })
    const res = await fetch(`${BASE_URL}/task/${taskId}/comment`, {
      method: 'POST',
      headers: { ...headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ comment }),
    })
    return res.ok
  } catch {
    return false
  }
}
