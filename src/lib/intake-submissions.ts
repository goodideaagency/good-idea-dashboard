import { createAdminClient } from './supabase/admin'

// Kept in sync with the `kind` check constraint on public.intake_submissions
// (see supabase/migrations/0020_intake_submissions.sql).
export type IntakeKind = 'managed_service_intake' | 'service_request' | 'project_comment'

export type ReadableAnswer = { question: string; answer: string }

// FormData as submitted, minus any File objects (never worth persisting --
// see uploadTaskAttachment call sites, which already handle files
// separately) -- a complete safety net alongside `readable` below, in case
// the caller's own field-mapping logic has a bug.
export function formDataToPlainObject(formData: FormData): Record<string, unknown> {
  const obj: Record<string, unknown> = {}
  for (const [key, value] of formData.entries()) {
    if (value instanceof File) continue
    const existing = obj[key]
    if (existing === undefined) obj[key] = value
    else if (Array.isArray(existing)) existing.push(value)
    else obj[key] = [existing, value]
  }
  return obj
}

// Persists a submitted form's answers BEFORE any ClickUp write is attempted,
// so an expired session, a business-rule rejection, or a ClickUp failure can
// never again mean the answers are gone -- only ClickUp's own record of them
// would be. Returns the new row's id (to pass to markIntakeSubmissionSynced
// later), or null if the insert itself failed -- callers should not block
// submission on this, just proceed either way.
export async function recordIntakeSubmission(params: {
  kind: IntakeKind
  agencyId: string
  accountId?: string | null
  userId: string
  context: Record<string, unknown>
  formEntries: Record<string, unknown>
  readable: ReadableAnswer[]
}): Promise<string | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('intake_submissions')
    .insert({
      kind: params.kind,
      agency_id: params.agencyId,
      account_id: params.accountId ?? null,
      user_id: params.userId,
      context: params.context,
      raw_data: { formEntries: params.formEntries, readable: params.readable },
    })
    .select('id')
    .single()
  return data?.id ?? null
}

// Marks a submission as fully synced once its ClickUp task(s) actually
// exist -- rows left 'pending' are exactly the ones that need a human to
// follow up (see the admin recovery page).
export async function markIntakeSubmissionSynced(
  id: string | null,
  externalIds: Record<string, unknown>
): Promise<void> {
  if (!id) return
  const admin = createAdminClient()
  await admin
    .from('intake_submissions')
    .update({ status: 'synced', external_ids: externalIds })
    .eq('id', id)
}
