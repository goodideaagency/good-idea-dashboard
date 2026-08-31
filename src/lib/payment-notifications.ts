import { createAdminClient } from './supabase/admin'

function money(cents: number, currency: string) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format(
    cents / 100
  )
}

// Fans a Stripe invoice outcome (paid or payment_failed) out to every user in
// the owning agency as an in-app notification. Deduped on
// (user_id, stripe_invoice_id, kind) -- a webhook redelivery, or Stripe's own
// dunning retries re-firing invoice.payment_failed for the same
// still-failing invoice, must never spam a fresh notification each time.
export async function createPaymentNotification(input: {
  agencyId: string
  accountId: string | null
  kind: 'payment_failed' | 'payment_succeeded'
  productName: string
  accountName: string | null
  amountCents: number
  currency: string
  hostedInvoiceUrl: string | null
  stripeInvoiceId: string
}): Promise<void> {
  const admin = createAdminClient()
  const { data: agencyUsers } = await admin
    .from('agency_users')
    .select('user_id')
    .eq('agency_id', input.agencyId)
  const userIds = (agencyUsers ?? []).map((u) => u.user_id as string)
  if (userIds.length === 0) return

  const forLabel = input.accountName ? ` for ${input.accountName}` : ''
  const amount = money(input.amountCents, input.currency)

  const title =
    input.kind === 'payment_failed'
      ? `Payment failed — ${input.productName}`
      : `Payment received — ${input.productName}`
  const body =
    input.kind === 'payment_failed'
      ? `${input.productName}${forLabel} — ${amount} could not be charged. Update your payment method to keep this service active.`
      : `${input.productName}${forLabel} — ${amount} charged successfully.`

  await admin.from('notifications').upsert(
    userIds.map((uid) => ({
      user_id: uid,
      agency_id: input.agencyId,
      account_id: input.accountId,
      title,
      body,
      url: input.hostedInvoiceUrl,
      kind: input.kind,
      stripe_invoice_id: input.stripeInvoiceId,
    })),
    { onConflict: 'user_id,stripe_invoice_id,kind', ignoreDuplicates: true }
  )
}
