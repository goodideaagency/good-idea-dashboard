import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Uploads a brand file/document to Storage and records it in account_files.
// Ownership is verified with the RLS-scoped client; the insert itself also
// goes through that client so the insert policy re-checks independently.
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

  const { data: owned } = await supabase.from('accounts').select('id').eq('id', accountId).maybeSingle()
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const admin = createAdminClient()
  const ext = file.name.includes('.') ? file.name.split('.').pop() : ''
  const path = `files/${accountId}/${randomUUID()}${ext ? `.${ext}` : ''}`
  const bytes = await file.arrayBuffer()
  const { error: uploadError } = await admin.storage
    .from('account-assets')
    .upload(path, bytes, { contentType: file.type || 'application/octet-stream' })
  if (uploadError) return NextResponse.json({ error: 'Upload failed' }, { status: 500 })

  const { data: pub } = admin.storage.from('account-assets').getPublicUrl(path)

  const { data: row, error: insertError } = await supabase
    .from('account_files')
    .insert({
      account_id: accountId,
      name: file.name,
      storage_path: path,
      url: pub.publicUrl,
      size_bytes: file.size,
      content_type: file.type || null,
    })
    .select('id, name, url, size_bytes, created_at')
    .single()
  if (insertError || !row) return NextResponse.json({ error: 'Save failed' }, { status: 500 })

  return NextResponse.json({ file: row })
}

// Deletes a file -- RLS ensures the row (and thus its storage_path) is only
// ever visible/removable for an account in the caller's own agency.
export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const { data: file } = await supabase
    .from('account_files')
    .select('id, storage_path')
    .eq('id', id)
    .maybeSingle()
  if (!file) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const admin = createAdminClient()
  await admin.storage.from('account-assets').remove([file.storage_path])
  await supabase.from('account_files').delete().eq('id', id)

  return NextResponse.json({ ok: true })
}
