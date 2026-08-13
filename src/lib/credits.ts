import type Stripe from 'stripe'
import { stripe } from './stripe'
import { createAdminClient } from './supabase/admin'

// Whether an agency is allowed to buy credit top-ups: at least one active
// (or trialing) subscription whose product is a credit-granting plan
// (credits_per_cycle metadata > 0).
export async function agencyIsCreditEligible(agencyId: string): Promise<boolean> {
  const admin = createAdminClient()
  const { data: subs } = await admin
    .from('subscriptions')
    .select('stripe_price_id')
    .eq('agency_id', agencyId)
    .in('status', ['active', 'trialing'])
  const priceIds = [...new Set((subs ?? []).map((s) => s.stripe_price_id as string).filter(Boolean))]
  if (priceIds.length === 0) return false

  for (const priceId of priceIds) {
    try {
      const price = await stripe.prices.retrieve(priceId, { expand: ['product'] })
      const product = price.product as import('stripe').default.Product
      if (Number(product?.metadata?.credits_per_cycle ?? 0) > 0) return true
    } catch {
      // A subscription row can reference a price that no longer resolves
      // (deleted, or from a different Stripe mode than the app's key) --
      // skip it rather than failing the whole dashboard load.
    }
  }
  return false
}

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

// Active one-time products flagged as credit top-ups (credit_amount metadata
// > 0), cheapest first -- shown on /dashboard/credits to eligible agencies.
export type CreditTopupProduct = { productId: string; priceId: string; name: string; amountCents: number; currency: string; credits: number }
export async function listCreditTopupProducts(): Promise<CreditTopupProduct[]> {
  const prices: import('stripe').default.Price[] = []
  let page = await stripe.prices.list({ active: true, type: 'one_time', expand: ['data.product'], limit: 100 })
  prices.push(...page.data)
  while (page.has_more) {
    page = await stripe.prices.list({
      active: true,
      type: 'one_time',
      expand: ['data.product'],
      limit: 100,
      starting_after: prices[prices.length - 1].id,
    })
    prices.push(...page.data)
  }

  return prices
    .map((price) => {
      const product = price.product as import('stripe').default.Product
      const credits = Number(product?.metadata?.credit_amount ?? 0)
      if (!product || (product as unknown as { deleted?: boolean }).deleted || credits <= 0) return null
      return {
        productId: product.id,
        priceId: price.id,
        name: product.name,
        amountCents: price.unit_amount ?? 0,
        currency: (price.currency ?? 'usd').toUpperCase(),
        credits,
      }
    })
    .filter((p): p is CreditTopupProduct => p !== null)
    .sort((a, b) => a.amountCents - b.amountCents)
}

// Merged, newest-first timeline of grants and charges for the credits page.
export type CreditHistoryEntry =
  | { type: 'grant'; id: string; amount: number; source: CreditSource; note: string | null; at: string; expiresAt: string }
  | { type: 'charge'; id: string; amount: number; reason: CreditChargeReason; note: string | null; at: string }
export async function getAgencyCreditHistory(agencyId: string): Promise<CreditHistoryEntry[]> {
  const admin = createAdminClient()
  const [{ data: grants }, { data: charges }] = await Promise.all([
    admin
      .from('credit_grants')
      .select('id, amount, source, note, granted_at, expires_at')
      .eq('agency_id', agencyId)
      .order('granted_at', { ascending: false })
      .limit(50),
    admin
      .from('credit_charges')
      .select('id, amount, reason, note, created_at')
      .eq('agency_id', agencyId)
      .order('created_at', { ascending: false })
      .limit(50),
  ])

  const entries: CreditHistoryEntry[] = [
    ...(grants ?? []).map((g) => ({
      type: 'grant' as const,
      id: g.id as string,
      amount: g.amount as number,
      source: g.source as CreditSource,
      note: g.note as string | null,
      at: g.granted_at as string,
      expiresAt: g.expires_at as string,
    })),
    ...(charges ?? []).map((c) => ({
      type: 'charge' as const,
      id: c.id as string,
      amount: c.amount as number,
      reason: c.reason as CreditChargeReason,
      note: c.note as string | null,
      at: c.created_at as string,
    })),
  ]
  return entries.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
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
  const { error } = await admin.rpc('grant_agency_credits', {
    p_agency_id: agencyId,
    p_amount: amount,
    p_source: source,
    p_stripe_event_id: opts.stripeEventId ?? null,
    p_note: opts.note ?? null,
    p_created_by: opts.createdBy ?? null,
    p_clickup_task_id: opts.clickupTaskId ?? null,
  })
  // Supabase-js doesn't throw on a failed RPC by default -- every caller
  // here is the Stripe webhook, which needs this to throw so its try/catch
  // returns a 500 and Stripe retries the delivery, instead of a DB error
  // being silently discarded and the grant lost forever behind a 200 OK.
  if (error) throw new Error(`grant_agency_credits failed: ${error.message}`)
}

// Grants credits for a completed one-time top-up Checkout Session.
// Idempotent on the SESSION id (not the delivering Stripe event id) -- safe
// to call from both the webhook (primary) and the checkout return page
// (fallback, in case that event is delayed or never delivered), same
// pattern as provisionSignupAgency for signups. Before this existed, a lost
// top-up webhook meant the customer was charged real money and simply never
// received the credits, with nothing to catch it.
export async function grantTopupCredits(session: Stripe.Checkout.Session): Promise<void> {
  const agencyId = session.metadata?.agency_id
  if (!agencyId) return
  const lineItems = await stripe.checkout.sessions.listLineItems(session.id, {
    expand: ['data.price.product'],
  })
  const product = lineItems.data[0]?.price?.product as Stripe.Product | undefined
  const credits = Number(product?.metadata?.credit_amount ?? 0)
  if (credits <= 0) return
  await grantAgencyCredits(agencyId, credits, 'topup', {
    stripeEventId: session.id,
    note: `${product?.name ?? 'Credit top-up'} purchase`,
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
  const { error } = await admin.rpc('forfeit_agency_credits', { p_agency_id: agencyId })
  if (error) throw new Error(`forfeit_agency_credits failed: ${error.message}`)
}

// The net amount currently charged against a specific ClickUp task -- used
// to turn a "Credit Cost" field edit into a charge/refund of just the
// difference, instead of double-charging the original amount. Must net out
// any prior task_cost_decrease refunds (see reconcileTaskCost), which land
// as fresh credit_grants rows, not as negative credit_charges -- otherwise
// a cost that's lowered then later raised again computes the wrong delta.
// Confirmed: without this, lower-then-raise permanently undercharges the
// agency by the refunded amount.
export async function getAlreadyChargedForTask(clickupTaskId: string): Promise<number> {
  const admin = createAdminClient()
  const [{ data: charges }, { data: refunds }] = await Promise.all([
    admin.from('credit_charges').select('amount').eq('clickup_task_id', clickupTaskId),
    admin
      .from('credit_grants')
      .select('amount')
      .eq('clickup_task_id', clickupTaskId)
      .eq('source', 'task_cost_decrease'),
  ])
  const totalCharged = (charges ?? []).reduce((sum, c) => sum + (c.amount as number), 0)
  const totalRefunded = (refunds ?? []).reduce((sum, g) => sum + (g.amount as number), 0)
  return totalCharged - totalRefunded
}

export type ReconcileTaskCostResult = { ok: true } | { ok: false; shortfall: number }

// Reconciles a task's Credit Cost field to a new total: charges the
// difference if it went up, refunds (as a fresh grant) if it went down.
// Idempotent in effect -- re-processing the same field value is a no-op
// since the delta against what's already charged is 0.
//
// Returns ok: false (with the amount that couldn't be charged) if the
// agency's balance is insufficient -- spendAgencyCredits already declines
// to overdraw rather than throwing, but the caller here used to just
// discard that outcome. The ledger permanently under-reflected the real
// task cost with nothing anywhere surfacing it -- see the ClickUp webhook,
// which now posts a comment on the task so your team sees it where they're
// already working.
export async function reconcileTaskCost(
  agencyId: string,
  accountId: string | null,
  clickupTaskId: string,
  newTotalCost: number
): Promise<ReconcileTaskCostResult> {
  const alreadyCharged = await getAlreadyChargedForTask(clickupTaskId)
  const delta = newTotalCost - alreadyCharged
  if (delta > 0) {
    const spent = await spendAgencyCredits(agencyId, delta, 'task_cost_increase', {
      accountId: accountId ?? undefined,
      clickupTaskId,
    })
    if (!spent) return { ok: false, shortfall: delta }
  } else if (delta < 0) {
    await grantAgencyCredits(agencyId, -delta, 'task_cost_decrease', {
      clickupTaskId,
      note: 'Task Credit Cost was lowered',
    })
  }
  return { ok: true }
}
