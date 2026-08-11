import type Stripe from 'stripe'
import { stripe } from '@/lib/stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import { createFolder } from '@/lib/clickup'
import { upsertSubscriptionFromStripe } from '@/lib/subscriptions'
import { getManagedServiceByPriceId } from '@/lib/service-catalog'

// "Good Idea Clients" ClickUp Space -- every agency's own Folder (and in turn
// every client List) lives under this one, fixed Space.
const GOOD_IDEA_CLIENTS_SPACE_ID = '90146610086'

export type SignupProvisionResult = { agencyId: string; priceId: string; kind: 'managed' | 'credits' }

// Turns a completed signup Checkout Session into a real agency: creates the
// agency row + its ClickUp Folder, invites the owner's login (the DB trigger
// attaches them to this agency via agency_id in the invite metadata -- see
// migration 0004), and tags the subscription/customer with our usual
// metadata. Idempotent on the Stripe customer id, so it's safe to call from
// both the webhook (primary) and the checkout return page (fallback) without
// risk of double-creating anything if both happen to run.
export async function provisionSignupAgency(
  session: Stripe.Checkout.Session
): Promise<SignupProvisionResult | null> {
  const agencyName = session.metadata?.agency_name
  const ownerName = session.metadata?.owner_name
  const ownerEmail = session.metadata?.owner_email
  const priceId = session.metadata?.price_id
  const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id
  const subscriptionId =
    typeof session.subscription === 'string' ? session.subscription : session.subscription?.id
  if (!agencyName || !ownerEmail || !priceId || !customerId || !subscriptionId) return null

  const admin = createAdminClient()

  const { data: existing } = await admin
    .from('agencies')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle()

  let agencyId: string
  if (existing) {
    agencyId = existing.id
  } else {
    const { data: agency } = await admin
      .from('agencies')
      .insert({ name: agencyName, stripe_customer_id: customerId })
      .select('id')
      .single()
    if (!agency) return null
    agencyId = agency.id

    const folder = await createFolder(GOOD_IDEA_CLIENTS_SPACE_ID, agencyName)
    if (folder) await admin.from('agencies').update({ clickup_folder_id: folder.id }).eq('id', agencyId)

    // Creates the owner's auth user (unconfirmed, invited) so they exist by
    // the time the browser reaches the checkout return page -- that page
    // mints its own fresh sign-in link rather than reusing this one, so a
    // failure here (e.g. email already registered) isn't fatal to signup.
    await admin.auth.admin
      .generateLink({
        type: 'invite',
        email: ownerEmail,
        options: { data: { agency_id: agencyId, full_name: ownerName } },
      })
      .catch(() => {})
  }

  const subscription = await stripe.subscriptions.update(subscriptionId, {
    metadata: { agency_id: agencyId, agency_name: agencyName },
  })
  await stripe.customers.update(customerId, { metadata: { agency_id: agencyId, agency_name: agencyName } })
  await upsertSubscriptionFromStripe(subscription)

  const kind: 'managed' | 'credits' = getManagedServiceByPriceId(priceId) ? 'managed' : 'credits'
  return { agencyId, priceId, kind }
}
