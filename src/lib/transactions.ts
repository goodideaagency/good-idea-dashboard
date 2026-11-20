import { stripe } from '@/lib/stripe'

// A single payment record (Stripe invoice) shown in transaction history.
export type Txn = {
  id: string
  date: string // ISO
  amount: number // cents
  currency: string // e.g. "USD"
  status: string // paid, open, void, uncollectible, draft
  number: string | null
  url: string | null // hosted invoice / receipt page
  subscriptionId: string | null
  // Only set for records that have no subscription to look a name up from
  // (credit top-ups): what to show in the Account / Agency columns instead.
  label?: string | null
  agencyName?: string | null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalize(inv: any): Txn {
  const rawSub =
    (typeof inv.subscription === 'string' ? inv.subscription : inv.subscription?.id) ??
    inv.parent?.subscription_details?.subscription ??
    null
  return {
    id: inv.id,
    date: new Date(inv.created * 1000).toISOString(),
    amount: inv.total ?? inv.amount_paid ?? 0,
    currency: (inv.currency ?? 'usd').toUpperCase(),
    status: inv.status ?? 'unknown',
    number: inv.number ?? null,
    url: inv.hosted_invoice_url ?? null,
    subscriptionId: typeof rawSub === 'string' ? rawSub : (rawSub?.id ?? null),
  }
}

// Every transaction for one agency (their single Stripe customer). Returns []
// on failure (e.g. a stale/wrong-mode id) so one bad lookup never crashes the page.
export async function listInvoicesForCustomer(customerId: string, limit = 100): Promise<Txn[]> {
  try {
    const res = await stripe.invoices.list({ customer: customerId, limit })
    return res.data.map(normalize)
  } catch {
    return []
  }
}

// Every transaction across several Stripe customer ids, merged and sorted
// newest-first. "One Stripe customer per agency" only holds for agencies
// that bought everything through this platform's own checkout -- an agency
// migrated from elsewhere can have its subscriptions scattered across
// several legacy Stripe customers (one per original end-client), and its
// own agencies.stripe_customer_id may not even be set yet if it's never
// bought anything new here. Confirmed live: Digitac/Pixan's Transactions
// page was showing completely empty for exactly this reason. Dedupes by
// invoice id in case the same customer id is passed more than once.
export async function listInvoicesForCustomers(customerIds: string[], limit = 100): Promise<Txn[]> {
  const uniqueIds = [...new Set(customerIds.filter(Boolean))]
  const results = await Promise.all(uniqueIds.map((id) => listInvoicesForCustomer(id, limit)))
  const byId = new Map<string, Txn>()
  for (const txn of results.flat()) byId.set(txn.id, txn)
  return [...byId.values()].sort((a, b) => b.date.localeCompare(a.date))
}

// Transactions for a single subscription. Same failure handling as above.
export async function listInvoicesForSubscription(
  subscriptionId: string,
  limit = 100
): Promise<Txn[]> {
  try {
    const res = await stripe.invoices.list({ subscription: subscriptionId, limit })
    return res.data.map(normalize)
  } catch {
    return []
  }
}

// Every transaction across the whole Stripe account (admin view).
export async function listAllInvoices(limit = 100): Promise<Txn[]> {
  try {
    const res = await stripe.invoices.list({ limit })
    return res.data.map(normalize)
  } catch {
    return []
  }
}

// A credit top-up is a one-time Checkout Session (mode "payment"), which
// Stripe does not turn into an invoice -- so it never appears in the
// invoice lists above, even though the agency was really charged and
// credited. Read them from the checkout sessions instead, keeping only
// the ones this platform created (metadata.credit_topup) that actually
// got paid, and pulling the receipt from the underlying charge.
const TOPUP_EXPAND = ['data.line_items', 'data.payment_intent.latest_charge']

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeTopup(sess: any): Txn | null {
  if (sess.mode !== 'payment' || sess.metadata?.credit_topup !== 'true') return null
  if (sess.payment_status !== 'paid') return null
  const pi = sess.payment_intent && typeof sess.payment_intent === 'object' ? sess.payment_intent : null
  const charge = pi?.latest_charge && typeof pi.latest_charge === 'object' ? pi.latest_charge : null
  return {
    id: sess.id,
    date: new Date((charge?.created ?? sess.created) * 1000).toISOString(),
    amount: sess.amount_total ?? 0,
    currency: (sess.currency ?? 'usd').toUpperCase(),
    status: charge?.refunded ? 'refunded' : 'paid',
    number: null,
    url: charge?.receipt_url ?? null,
    subscriptionId: null,
    label: sess.line_items?.data?.[0]?.description ?? 'Credit top-up',
    agencyName: sess.metadata?.agency_name ?? null,
  }
}

// Paid credit top-ups for one Stripe customer. Same failure handling as the
// invoice lists: a bad lookup returns [] instead of breaking the page.
export async function listTopupsForCustomer(customerId: string, limit = 100): Promise<Txn[]> {
  try {
    const res = await stripe.checkout.sessions.list({ customer: customerId, limit, expand: TOPUP_EXPAND })
    return res.data.map(normalizeTopup).filter((t): t is Txn => t !== null)
  } catch {
    return []
  }
}

// Paid credit top-ups across the whole Stripe account (admin view). Most
// sessions are subscription signups, so scan a few pages rather than just
// the newest 100 to avoid silently missing older top-ups.
export async function listAllTopups(maxSessions = 300): Promise<Txn[]> {
  try {
    const sessions = await stripe.checkout.sessions
      .list({ limit: 100, expand: TOPUP_EXPAND })
      .autoPagingToArray({ limit: maxSessions })
    return sessions.map(normalizeTopup).filter((t): t is Txn => t !== null)
  } catch {
    return []
  }
}

// Everything a customer set has been charged: subscription invoices plus
// credit top-ups, merged newest-first.
export async function listTransactionsForCustomers(customerIds: string[]): Promise<Txn[]> {
  const uniqueIds = [...new Set(customerIds.filter(Boolean))]
  const [invoices, topups] = await Promise.all([
    listInvoicesForCustomers(uniqueIds),
    Promise.all(uniqueIds.map((id) => listTopupsForCustomer(id))),
  ])
  return [...invoices, ...topups.flat()].sort((a, b) => b.date.localeCompare(a.date))
}
