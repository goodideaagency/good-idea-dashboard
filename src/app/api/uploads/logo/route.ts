import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Uploads a client's logo (already cropped to a square client-side) to
// Storage and points accounts.logo_url at it. Ownership is verified with
// the RLS-scoped client before the admin client does the actual write.
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
  const path = `logos/${accountId}/${randomUUID()}.png`
  const bytes = await file.arrayBuffer()
  const { error: uploadError } = await admin.storage
    .from('account-assets')
    .upload(path, bytes, { contentType: 'image/png' })
  if (uploadError) return NextResponse.json({ error: 'Upload failed' }, { status: 500 })

  const { data: pub } = admin.storage.from('account-assets').getPublicUrl(path)
  await admin.from('accounts').update({ logo_url: pub.publicUrl }).eq('id', accountId)

  return NextResponse.json({ url: pub.publicUrl })
}
