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

export type AgencyDraft = {
  kind: DraftKind
  context: Record<string, unknown>
  accountId: string | null
  accountName: string | null
  updatedAt: string
}

// Every in-progress draft across an agency's users -- powers the
// "needs completing" table on the Dashboard/Projects pages (see
// lib/projects.ts's listIncompleteForms). No RLS policy exists on
// form_drafts (service-role only, by design), so this always goes through
// the admin client rather than the caller's own session.
export async function listFormDraftsForAgency(agencyId: string): Promise<AgencyDraft[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('form_drafts')
    .select('kind, context, account_id, updated_at, accounts(name)')
    .eq('agency_id', agencyId)
  return (data ?? []).map((d) => {
    let context: Record<string, unknown> = {}
    try {
      context = JSON.parse(d.context as string)
    } catch {
      // malformed context -- treat as unmatched rather than throwing
    }
    return {
      kind: d.kind as DraftKind,
      context,
      accountId: d.account_id as string | null,
      accountName: (d.accounts as { name?: string } | null)?.name ?? null,
      updatedAt: d.updated_at as string,
    }
  })
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
