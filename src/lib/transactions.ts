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
