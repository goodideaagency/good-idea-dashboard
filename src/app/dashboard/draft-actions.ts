'use server'

import { createClient } from '@/lib/supabase/server'
import { saveFormDraft, deleteFormDraft, type DraftKind } from '@/lib/form-drafts'
import { formDataToPlainObject } from '@/lib/intake-submissions'

// Called every few seconds from the client while someone is typing into the
// managed-service intake or one-time service request form (see
// components/draft-autosave.tsx) -- well before Submit. Fails silently
// (no redirect, no thrown error) since this runs in the background and
// should never interrupt someone mid-form; a failed autosave just means
// the NEXT tick tries again.
export async function autosaveDraft(formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return

  const kind = String(formData.get('__draft_kind') || '') as DraftKind
  const contextRaw = String(formData.get('__draft_context') || '{}')
  if (kind !== 'managed_service_intake' && kind !== 'service_request') return

  const { data: membership } = await supabase
    .from('agency_users')
    .select('agency_id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!membership) return

  let context: Record<string, unknown>
  try {
    context = JSON.parse(contextRaw)
  } catch {
    return
  }

  const accountId = String(formData.get('account_id') || '').trim() || null

  const entries = formDataToPlainObject(formData)
  delete entries.__draft_kind
  delete entries.__draft_context

  await saveFormDraft({
    userId: user.id,
    agencyId: membership.agency_id as string,
    accountId,
    kind,
    context,
    formEntries: entries,
  })
}

// Discards a saved draft -- the "start over" action on the restored-draft
// banner.
export async function discardDraft(formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return

  const kind = String(formData.get('kind') || '') as DraftKind
  const contextRaw = String(formData.get('context') || '{}')
  if (kind !== 'managed_service_intake' && kind !== 'service_request') return

  let context: Record<string, unknown>
  try {
    context = JSON.parse(contextRaw)
  } catch {
    return
  }

  await deleteFormDraft({ userId: user.id, kind, context })
}
