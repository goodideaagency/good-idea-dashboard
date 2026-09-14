import { createAdminClient } from './supabase/admin'

// Kept in sync with the `kind` check constraint on public.form_drafts (see
// supabase/migrations/0021_form_drafts.sql).
export type DraftKind = 'managed_service_intake' | 'service_request'

export type FormDraft = {
  formEntries: Record<string, unknown>
  updatedAt: string
}

// Sorted-key JSON so the same logical context (e.g. { price_id: 'x' })
// always produces the same stored/matched string regardless of how the
// caller happened to build the object.
function contextKey(context: Record<string, unknown>): string {
  return JSON.stringify(
    Object.keys(context)
      .sort()
      .reduce((acc, key) => ({ ...acc, [key]: context[key] }), {} as Record<string, unknown>)
  )
}

// Autosaves the current state of a long intake form -- called every few
// seconds while someone is typing (see components/draft-autosave.tsx), well
// before they've clicked Submit. `context` identifies which form this is
// (e.g. { price_id } or { service_key }); the unique constraint on
// (user_id, kind, context) makes this a plain upsert.
export async function saveFormDraft(params: {
  userId: string
  agencyId: string
  accountId?: string | null
  kind: DraftKind
  context: Record<string, unknown>
  formEntries: Record<string, unknown>
}): Promise<void> {
  const admin = createAdminClient()
  await admin.from('form_drafts').upsert(
    {
      user_id: params.userId,
      agency_id: params.agencyId,
      account_id: params.accountId ?? null,
      kind: params.kind,
      context: contextKey(params.context),
      form_entries: params.formEntries,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,kind,context' }
  )
}

// Looks up a previously autosaved draft for this exact form, if any -- used
// by the form page to pre-fill fields and show a "restored your progress"
// notice.
export async function getFormDraft(params: {
  userId: string
  kind: DraftKind
  context: Record<string, unknown>
}): Promise<FormDraft | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('form_drafts')
    .select('form_entries, updated_at')
    .eq('user_id', params.userId)
    .eq('kind', params.kind)
    .eq('context', contextKey(params.context))
    .maybeSingle<{ form_entries: Record<string, unknown>; updated_at: string }>()
  if (!data) return null
  return { formEntries: data.form_entries, updatedAt: data.updated_at }
}

// Removes a draft -- called once the real submission succeeds (so a
// completed form doesn't leave a stale draft to incorrectly "restore"
// later) and from the manual "Discard" action.
export async function deleteFormDraft(params: {
  userId: string
  kind: DraftKind
  context: Record<string, unknown>
}): Promise<void> {
  const admin = createAdminClient()
  await admin
    .from('form_drafts')
    .delete()
    .eq('user_id', params.userId)
    .eq('kind', params.kind)
    .eq('context', contextKey(params.context))
}
