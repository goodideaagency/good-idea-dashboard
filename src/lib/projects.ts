import { createClient } from '@/lib/supabase/server'
import { listTaskSummariesForAccount, type ClickUpTaskSummary } from '@/lib/clickup'
import { getManagedServiceByPriceId, getServiceByKey } from '@/lib/service-catalog'
import { listFormDraftsForAgency } from '@/lib/form-drafts'

export type ProjectTask = ClickUpTaskSummary & {
  accountId: string
  accountName: string
}

export type ProjectTasksResult = { tasks: ProjectTask[]; failedAccountNames: string[] }

// Every ClickUp task across every account the caller's agency has connected
// (accounts.clickup_list_id), enriched with which account it belongs to.
// Powers the Dashboard and Projects pages. Scoped to the caller's own agency
// via RLS on the accounts lookup.
//
// One account's ClickUp List failing to load no longer blanks out every
// other account's real tasks -- each is caught independently, and which
// ones failed is reported back so the page can say so, instead of that
// failure looking identical to "this client genuinely has no projects."
export async function listProjectTasksForAgency(): Promise<ProjectTasksResult> {
  const supabase = await createClient()
  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, name, clickup_list_id')
    .not('clickup_list_id', 'is', null)

  const connected = accounts ?? []
  const failedAccountNames: string[] = []
  const results = await Promise.all(
    connected.map(async (a) => {
      try {
        const tasks = await listTaskSummariesForAccount(a.clickup_list_id as string)
        return tasks.map((t) => ({ ...t, accountId: a.id, accountName: a.name }))
      } catch {
        failedAccountNames.push(a.name as string)
        return []
      }
    })
  )
  return { tasks: results.flat(), failedAccountNames }
}

export type IncompleteForm = {
  label: string
  accountName: string
  status: 'draft' | 'not_started'
  updatedAt: string | null
  href: string
}

// Every form that still needs finishing for an agency: a saved draft
// (either kind -- someone started and didn't finish), or a paid
// managed-service subscription whose intake form was never even opened
// (no client-facing ClickUp task exists for it yet). The latter is
// detected against real ClickUp state (`tasks`, already fetched by the
// caller via listProjectTasksForAgency) rather than the intake_submissions
// table -- that table is new, so checking it would wrongly flag every
// already-completed service set up before it existed.
export async function listIncompleteForms(
  agencyId: string,
  tasks: ProjectTask[]
): Promise<IncompleteForm[]> {
  const supabase = await createClient()
  const [{ data: subs }, drafts] = await Promise.all([
    supabase
      .from('subscriptions')
      .select('account_id, stripe_price_id, accounts(name)')
      .eq('agency_id', agencyId)
      .in('status', ['active', 'trialing']),
    listFormDraftsForAgency(agencyId),
  ])

  const results: IncompleteForm[] = []

  for (const sub of subs ?? []) {
    const priceId = sub.stripe_price_id
    const accountId = sub.account_id
    if (!priceId || !accountId) continue
    const service = getManagedServiceByPriceId(priceId)
    if (!service) continue

    const alreadyDone = tasks.some((t) => t.accountId === accountId && t.name === service.clientTaskName)
    if (alreadyDone) continue

    const matchingDraft = drafts.find(
      (d) => d.kind === 'managed_service_intake' && d.accountId === accountId && d.context.price_id === priceId
    )

    results.push({
      label: service.label,
      accountName: (sub.accounts as { name?: string } | null)?.name ?? 'Unknown client',
      status: matchingDraft ? 'draft' : 'not_started',
      updatedAt: matchingDraft?.updatedAt ?? null,
      href: `/dashboard/onboarding/${priceId}?account_id=${accountId}`,
    })
  }

  // A one-time/credit service request has no "paid but never started"
  // state the way a subscription does -- it only ever shows up here as a
  // saved draft.
  for (const draft of drafts) {
    if (draft.kind !== 'service_request') continue
    const serviceKey = typeof draft.context.service_key === 'string' ? draft.context.service_key : undefined
    const service = serviceKey ? getServiceByKey(serviceKey) : undefined
    if (!service || !serviceKey) continue

    results.push({
      label: service.label,
      accountName: draft.accountName ?? 'Unknown client',
      status: 'draft',
      updatedAt: draft.updatedAt,
      href: `/dashboard/request/${serviceKey}`,
    })
  }

  return results
}
