import { createAdminClient } from './supabase/admin'

// Balance is always derived, never stored -- sum of what's left in every
// grant (batch) that hasn't expired yet. See migration 0012 for why credits
// are a ledger of batches instead of one number.
export async function getAgencyCreditBalance(agencyId: string): Promise<number> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('credit_grants')
    .select('remaining')
    .eq('agency_id', agencyId)
    .gt('expires_at', new Date().toISOString())
  return (data ?? []).reduce((sum, g) => sum + (g.remaining as number), 0)
}

export type CreditSource = 'subscription_initial' | 'subscription_renewal' | 'topup' | 'manual' | 'task_cost_decrease'

// Grants credits to an agency. Pass stripeEventId whenever the grant is
// triggered by a Stripe webhook -- makes it safe to call twice for the same
// event (a retried delivery) without double-granting.
export async function grantAgencyCredits(
  agencyId: string,
  amount: number,
  source: CreditSource,
  opts: { stripeEventId?: string; note?: string; createdBy?: string; clickupTaskId?: string } = {}
): Promise<void> {
  if (amount <= 0) return
  const admin = createAdminClient()
  await admin.rpc('grant_agency_credits', {
    p_agency_id: agencyId,
    p_amount: amount,
    p_source: source,
    p_stripe_event_id: opts.stripeEventId ?? null,
    p_note: opts.note ?? null,
    p_created_by: opts.createdBy ?? null,
    p_clickup_task_id: opts.clickupTaskId ?? null,
  })
}

export type CreditChargeReason = 'service_request' | 'task_cost_increase' | 'manual'

// Spends credits FIFO across the agency's non-expired grants. Returns false
// (and deducts nothing) if the balance is insufficient -- always check this
// before creating whatever the credits were paying for.
export async function spendAgencyCredits(
  agencyId: string,
  amount: number,
  reason: CreditChargeReason,
  opts: { accountId?: string; clickupTaskId?: string; createdBy?: string; note?: string } = {}
): Promise<boolean> {
  if (amount <= 0) return true
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('spend_agency_credits', {
    p_agency_id: agencyId,
    p_amount: amount,
    p_reason: reason,
    p_account_id: opts.accountId ?? null,
    p_clickup_task_id: opts.clickupTaskId ?? null,
    p_created_by: opts.createdBy ?? null,
    p_note: opts.note ?? null,
  })
  if (error) return false
  return data === true
}

// Forfeits every remaining credit for an agency -- called when their last
// active credit-granting subscription is cancelled (see the Stripe webhook).
export async function forfeitAgencyCredits(agencyId: string): Promise<void> {
  const admin = createAdminClient()
  await admin.rpc('forfeit_agency_credits', { p_agency_id: agencyId })
}

// How many credits have already been charged for a specific ClickUp task --
// used to turn a "Credit Cost" field edit into a charge/refund of just the
// difference, instead of double-charging the original amount.
export async function getAlreadyChargedForTask(clickupTaskId: string): Promise<number> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('credit_charges')
    .select('amount')
    .eq('clickup_task_id', clickupTaskId)
  return (data ?? []).reduce((sum, c) => sum + (c.amount as number), 0)
}

// Reconciles a task's Credit Cost field to a new total: charges the
// difference if it went up, refunds (as a fresh grant) if it went down.
// Idempotent in effect -- re-processing the same field value is a no-op
// since the delta against what's already charged is 0.
export async function reconcileTaskCost(
  agencyId: string,
  accountId: string | null,
  clickupTaskId: string,
  newTotalCost: number
): Promise<void> {
  const alreadyCharged = await getAlreadyChargedForTask(clickupTaskId)
  const delta = newTotalCost - alreadyCharged
  if (delta > 0) {
    await spendAgencyCredits(agencyId, delta, 'task_cost_increase', {
      accountId: accountId ?? undefined,
      clickupTaskId,
    })
  } else if (delta < 0) {
    await grantAgencyCredits(agencyId, -delta, 'task_cost_decrease', {
      clickupTaskId,
      note: 'Task Credit Cost was lowered',
    })
  }
}
