'use server'

import { headers, cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import type Stripe from 'stripe'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { stripe } from '@/lib/stripe'
import { createList } from '@/lib/clickup'
import { ensureAgencyStripeCustomer } from '@/lib/subscriptions'
import { getActiveCreditSubscription } from '@/lib/credits'
import { IMPERSONATION_COOKIE } from '@/lib/impersonation'

// Ends an admin's impersonation session and logs them back into their own
// admin account. The cookie only carries an opaque token -- the admin's
// real email is looked up from admin_impersonation_sessions, a row that
// only impersonateUser (already admin-gated) can create, and this token is
// single-use and short-lived so a stolen/replayed cookie can't be reused.
export async function returnToAdmin() {
  const cookieStore = await cookies()
  const token = cookieStore.get(IMPERSONATION_COOKIE)?.value
  cookieStore.delete(IMPERSONATION_COOKIE)
  if (!token) redirect('/admin/login')

  const admin = createAdminClient()
  const { data: session } = await admin
    .from('admin_impersonation_sessions')
    .select('admin_email, expires_at, used_at')
    .eq('token', token)
    .maybeSingle()

  if (!session || session.used_at || new Date(session.expires_at) < new Date()) {
    redirect('/admin/login')
  }

  await admin.from('admin_impersonation_sessions').update({ used_at: new Date().toISOString() }).eq('token', token)

  const { data: link, error } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: session.admin_email,
  })
  if (error || !link) redirect('/admin/login')

  // Verified against THIS request's client (not routed through /auth/confirm
  // via redirect()) so the session cookie actually lands -- see the comment
  // on impersonateUser for why that indirection turned out to be unreliable.
  const supabase = await createClient()
  const { error: verifyError } = await supabase.auth.verifyOtp({
    type: 'magiclink',
    token_hash: link.properties.hashed_token,
  })
  if (verifyError) redirect('/admin/login')

  redirect('/admin')
}

// Adds a service (subscription) for the logged-in agency and sends them to
// Stripe Checkout to pay for it. The service is attached either to an EXISTING
// client account (account_id) or to a NEW one created from name/website. Every
// subscription lands on the agency's ONE Stripe customer, tagged with the
// account it belongs to.
export async function addServiceAndCheckout(formData: FormData) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('agency_users')
    .select('agency_id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!membership) redirect('/dashboard')

  const priceId = String(formData.get('priceId') || '').trim()
  if (!priceId) redirect('/dashboard')

  // Agency Credits plans aren't tied to any one client -- the credits belong
  // to the agency itself -- so there's no account to pick or create.
  let isCreditPlan = false
  try {
    const price = await stripe.prices.retrieve(priceId, { expand: ['product'] })
    const product = price.product as Stripe.Product
    isCreditPlan = Number(product?.metadata?.credits_per_cycle ?? 0) > 0
  } catch {
    // fall through -- treated as a normal managed-service plan below
  }

  const existingAccountId = String(formData.get('account_id') || '').trim()
  const name = String(formData.get('name') || '').trim()
  const website = String(formData.get('website') || '').trim()

  const admin = createAdminClient()

  // 1. Ensure this agency has exactly ONE Stripe customer.
  const { data: agency } = await admin
    .from('agencies')
    .select('id, name, stripe_customer_id, clickup_folder_id')
    .eq('id', membership.agency_id)
    .single()
  if (!agency) redirect('/dashboard')

  // Agencies may only ever have one active credit plan at a time -- upgrade,
  // downgrade, or cancel through /dashboard/credits/change-plan instead of
  // starting a second one. Managed services have no such limit.
  if (isCreditPlan && (await getActiveCreditSubscription(agency.id))) {
    redirect('/dashboard/credits')
  }

  const customerId = await ensureAgencyStripeCustomer(admin, agency, user.email ?? undefined)

  // 2. Resolve the target account: an existing one (ownership enforced by RLS)
  //    or a brand-new one created from the submitted name/website. Skipped
  //    entirely for a credit plan.
  let accountId: string | undefined
  let accountName: string | undefined
  let returnTo = '/dashboard'
  if (!isCreditPlan) {
    if (existingAccountId) {
      const { data: acct } = await supabase
        .from('accounts')
        .select('id, name')
        .eq('id', existingAccountId)
        .maybeSingle()
      if (!acct) redirect('/dashboard')
      accountId = acct.id
      accountName = acct.name
      returnTo = `/dashboard/accounts/${accountId}`
    } else {
      if (!name) redirect('/dashboard')

      // Idempotency: this runs BEFORE Stripe Checkout, so unlike the
      // post-payment onboarding flow there's no already-claimed
      // subscription to check against yet -- a double-click or resubmit
      // here would otherwise create a second empty account + ClickUp List
      // every single time. Reuse a very recently created account with the
      // same name for this agency instead of creating another one.
      const { data: recent } = await admin
        .from('accounts')
        .select('id, name')
        .eq('agency_id', agency.id)
        .ilike('name', name)
        .gte('created_at', new Date(Date.now() - 5 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (recent) {
        accountId = recent.id
        accountName = recent.name
        returnTo = `/dashboard/accounts/${accountId}`
      } else {
        const { data: account } = await admin
          .from('accounts')
          .insert({ agency_id: agency.id, name, website: website || null })
          .select('id')
          .single()
        if (!account) redirect('/dashboard')
        accountId = account.id
        accountName = name
        returnTo = `/dashboard/accounts/${accountId}`

        // Same auto-provisioning a Client Profile gets -- without this, a
        // managed service bought for a brand-new client would have nowhere in
        // ClickUp for its post-payment intake task to land.
        if (agency.clickup_folder_id) {
          const list = await createList(agency.clickup_folder_id, name)
          if (list) await admin.from('accounts').update({ clickup_list_id: list.id }).eq('id', account.id)
        }
      }
    }
  }

  // 3. Start a Checkout Session tied to that customer (+ account, if any).
  const origin =
    (await headers()).get('origin') ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    'http://localhost:3000'

  // Both ids (for reliable programmatic lookup) and names (so a subscription
  // is traceable to its agency/client just by looking at it in the Stripe
  // dashboard -- no cross-referencing the platform or ClickUp required).
  // Set on the subscription itself (not just the Checkout Session), since
  // the session disappears after checkout but the subscription persists for
  // the life of the relationship.
  const stripeMetadata = {
    agency_id: agency.id,
    agency_name: agency.name,
    ...(accountId && accountName ? { account_id: accountId, account_name: accountName } : {}),
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    subscription_data: {
      metadata: stripeMetadata,
    },
    metadata: stripeMetadata,
    success_url: `${origin}/dashboard/checkout/return?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}${returnTo}`,
    allow_promotion_codes: true,
  })

  if (session.url) redirect(session.url)
  redirect(returnTo)
}
