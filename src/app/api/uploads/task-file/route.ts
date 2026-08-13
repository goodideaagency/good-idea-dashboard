import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getTaskListId, postAttachmentComment, uploadTaskAttachment } from '@/lib/clickup'

// Uploads a file straight onto a project task in ClickUp, attributed to the
// uploader via a bold-name comment (see clients/[id] uploads for the same
// pattern). Ownership is verified the same way postProjectComment does: the
// account must belong to the caller's agency, and the task's own List must
// match that account's List -- so a client can never attach to a task that
// isn't actually theirs, even by guessing an id.
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const form = await req.formData()
  const accountId = String(form.get('account_id') || '')
  const taskId = String(form.get('task_id') || '')
  const file = form.get('file')
  if (!accountId || !taskId || !(file instanceof File)) {
    return NextResponse.json({ error: 'Missing account_id, task_id, or file' }, { status: 400 })
  }

  const { data: account } = await supabase
    .from('accounts')
    .select('id, clickup_list_id')
    .eq('id', accountId)
    .maybeSingle<{ id: string; clickup_list_id: string | null }>()
  if (!account?.clickup_list_id) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const taskListId = await getTaskListId(taskId)
  if (taskListId !== account.clickup_list_id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const attachment = await uploadTaskAttachment(taskId, file, file.name)
  if (!attachment) return NextResponse.json({ error: 'Upload failed' }, { status: 500 })

  // Dropped BEFORE posting so the notification webhook can recognize this
  // as the platform posting on behalf of this specific user -- see
  // platform_comment_markers -- and skip notifying them of their own
  // upload.
  const admin = createAdminClient()
  await admin.from('platform_comment_markers').insert({ task_id: taskId, user_id: user.id })

  // The file itself is already safely attached above -- this comment is
  // just the "uploaded by X" attribution trail, so its failure shouldn't
  // fail the upload. It used to be silently discarded either way; now it's
  // at least reported back instead of implying it always succeeds.
  const authorName = (user.user_metadata as { full_name?: string })?.full_name
  const commentPosted = await postAttachmentComment(taskId, authorName || user.email || 'Client', attachment.id)

  return NextResponse.json({ file: attachment, commentPosted })
}
