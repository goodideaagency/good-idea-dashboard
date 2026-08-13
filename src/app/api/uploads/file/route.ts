import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { postAttachmentComment, uploadTaskAttachment } from '@/lib/clickup'
import { fileTooLarge, MAX_UPLOAD_BYTES } from '@/lib/upload-limits'

// Uploads a brand file/document straight onto the account's "Client Profile"
// task in ClickUp -- see clickup.ts: there's no delete-attachment endpoint,
// so removal has to happen in ClickUp directly (no DELETE handler here).
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const form = await req.formData()
  const accountId = String(form.get('account_id') || '')
  const file = form.get('file')
  if (!accountId || !(file instanceof File)) {
    return NextResponse.json({ error: 'Missing account_id or file' }, { status: 400 })
  }
  if (fileTooLarge(file)) {
    return NextResponse.json(
      { error: `Files must be under ${MAX_UPLOAD_BYTES / 1024 / 1024}MB.` },
      { status: 413 }
    )
  }

  // RLS ensures this only returns a row if the account belongs to the
  // caller's own agency.
  const { data: account } = await supabase
    .from('accounts')
    .select('id, clickup_profile_task_id')
    .eq('id', accountId)
    .maybeSingle<{ id: string; clickup_profile_task_id: string | null }>()
  if (!account) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!account.clickup_profile_task_id) {
    return NextResponse.json(
      { error: 'This client profile has no ClickUp task to attach files to yet.' },
      { status: 400 }
    )
  }

  const attachment = await uploadTaskAttachment(account.clickup_profile_task_id, file, file.name)
  if (!attachment) return NextResponse.json({ error: 'Upload failed' }, { status: 500 })

  // The file itself is already safely attached above -- this comment is
  // just the "uploaded by X" attribution trail, so its failure shouldn't
  // fail the upload. It used to be silently discarded either way; now it's
  // at least reported back instead of implying it always succeeds.
  const authorName = (user.user_metadata as { full_name?: string })?.full_name
  const commentPosted = await postAttachmentComment(
    account.clickup_profile_task_id,
    authorName || user.email || 'Client',
    attachment.id
  )

  return NextResponse.json({ file: attachment, commentPosted })
}
