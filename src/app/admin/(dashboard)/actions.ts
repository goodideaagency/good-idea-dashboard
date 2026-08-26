'use server'

import { randomUUID } from 'crypto'
import { cookies, headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAdmin } from '@/lib/admin-auth'
import { stripe } from '@/lib/stripe'
import { IMPERSONATION_COOKIE } from '@/lib/impersonation'
import { createList } from '@/lib/clickup'
import { upsertSubscriptionFromStripe } from '@/lib/subscriptions'

// Logs the calling admin into a real session as the target agency user --
// full read/write access, exactly what that user would see. Works by
// minting a Supabase magic-link token server-side (never emailed) and
// verifying it right here against the SAME client used for this request, so
// the new session's cookies land in this action's response -- routing that
// verification through a redirect to a separate Route Handler turned out to
// be unreliable (a Server Action's redirect() isn't a real browser
// navigation the way a Route Handler's is, so its Set-Cookie response never
// actually got applied). Every existing RLS/auth check in the app keeps
// working unmodified either way -- there's no special-cased "impersonating"
// branch anywhere except the return trip.
export async function impersonateUser(formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user: adminUser },
  } = await supabase.auth.getUser()
  if (!(await isAdmin(adminUser?.email))) redirect('/dashboard')

  const targetUserId = String(formData.get('user_id') || '').trim()
  if (!targetUserId) redirect('/admin')

  const admin = createAdminClient()
  const { data: targetUser } = await admin.auth.admin.getUserById(targetUserId)
  const targetEmail = targetUser.user?.email
  if (!targetEmail) redirect('/admin')

  // A random, unguessable token is the ONLY thing the cookie carries -- the
  // admin's actual email lives server-side, keyed by this token, so a
  // tampered cookie value can't be used to impersonate an arbitrary admin
  // on the way back (see returnToAdmin in dashboard/actions.ts).
  const token = randomUUID()
  await admin.from('admin_impersonation_sessions').insert({
    token,
    admin_email: adminUser!.email,
    expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  })

  const cookieStore = await cookies()
  cookieStore.set(IMPERSONATION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60,
  })

  const { data: link, error } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: targetEmail,
  })
  if (error || !link) redirect('/admin')

  const { error: verifyError } = await supabase.auth.verifyOtp({
    type: 'magiclink',
    token_hash: link.properties.hashed_token,
  })
  if (verifyError) redirect('/admin')

  redirect('/dashboard')
}

// Generates a fresh one-time login link for an existing agency user -- for
// onboarding a real customer whose original invite link is long gone, or
// getting someone back in who's locked out. Recovery type works regardless
// of whether they already have a password set: it always lands them on
// /set-password to choose a new one. The email is looked up server-side
// from the user id rather than trusted from the form, so a tampered request
// can't generate a link for an arbitrary address.
export async function sendLoginLink(formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!(await isAdmin(user?.email))) redirect('/dashboard')

  const targetUserId = String(formData.get('user_id') || '').trim()
  const agencyId = String(formData.get('agency_id') || '').trim()
  if (!targetUserId || !agencyId) redirect('/admin')

  const admin = createAdminClient()
  const { data: targetUser } = await admin.auth.admin.getUserById(targetUserId)
  const targetEmail = targetUser.user?.email
  if (!targetEmail) {
    redirect(`/admin/agencies/${agencyId}?error=` + encodeURIComponent('Could not find that login.'))
  }

  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email: targetEmail,
  })
  const hashedToken = linkData?.properties?.hashed_token
  if (linkErr || !hashedToken) {
    redirect(
      `/admin/agencies/${agencyId}?error=` +
        encodeURIComponent(linkErr?.message ?? 'Could not generate a login link.')
    )
  }

  const origin =
    (await headers()).get('origin') ?? process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
  const loginUrl = `${origin}/auth/confirm?token_hash=${hashedToken}&type=recovery&next=/set-password`

  redirect(
    `/admin/agencies/${agencyId}?loginLink=` +
      encodeURIComponent(loginUrl) +
      '&loginEmail=' +
      encodeURIComponent(targetEmail)
  )
}

// Archiving/unarchiving is purely a visibility flag on the agencies row —
// nothing in Stripe or Supabase auth is touched, so it's always reversible.
export async function setAgencyArchived(formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!(await isAdmin(user?.email))) redirect('/dashboard')

  const agencyId = String(formData.get('agency_id') || '').trim()
  const archived = formData.get('archived') === 'true'
  if (!agencyId) redirect('/admin')

  const admin = createAdminClient()
  await admin.from('agencies').update({ archived }).eq('id', agencyId)

  revalidatePath('/admin')
  revalidatePath('/admin/archived')
}

// One-time backfill for MRR: fills amount_cents/interval on any subscription
// row that predates those columns (migrated/legacy rows), by looking up its
// stored stripe_price_id in Stripe. New/updated subscriptions already get
// these fields from upsertSubscriptionFromStripe, so this is safe to re-run.
export async function syncSubscriptionAmounts() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!(await isAdmin(user?.email))) redirect('/dashboard')

  const admin = createAdminClient()
  const { data: rows } = await admin
    .from('subscriptions')
    .select('id, stripe_price_id')
    .is('amount_cents', null)
    .not('stripe_price_id', 'is', null)

  const priceCache = new Map<string, { amount: number | null; interval: string | null }>()

  for (const row of rows ?? []) {
    const priceId = row.stripe_price_id as string
    if (!priceCache.has(priceId)) {
      try {
        const price = await stripe.prices.retrieve(priceId)
        priceCache.set(priceId, {
          amount: price.unit_amount,
          interval: price.recurring?.interval ?? null,
        })
      } catch {
        priceCache.set(priceId, { amount: null, interval: null })
      }
    }
    const info = priceCache.get(priceId)!
    await admin
      .from('subscriptions')
      .update({ amount_cents: info.amount, interval: info.interval })
      .eq('id', row.id)
  }

  revalidatePath('/admin')
}

// One-time backfill: writes agency/account id + name metadata onto every
// existing Stripe subscription (and its customer), matching what new
// checkouts already set (see dashboard/actions.ts). Only touches the
// `metadata` field -- Stripe explicitly does not treat that as a billing
// change, so this never affects proration, invoicing, or subscription
// status. Safe to re-run any time (e.g. after renaming an agency/account).
export async function backfillSubscriptionMetadata() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!(await isAdmin(user?.email))) redirect('/dashboard')

  const admin = createAdminClient()
  const { data: subs } = await admin
    .from('subscriptions')
    .select('stripe_subscription_id, account_id, agency_id, accounts(name), agencies(name)')
    .not('stripe_subscription_id', 'is', null)

  const customersDone = new Set<string>()
  let updated = 0
  let failed = 0

  for (const s of subs ?? []) {
    const subId = s.stripe_subscription_id as string
    const accountName = (s.accounts as { name?: string } | null)?.name
    const agencyName = (s.agencies as { name?: string } | null)?.name
    if (!accountName || !agencyName || !s.account_id || !s.agency_id) {
      failed++
      continue
    }
    const metadata = {
      account_id: s.account_id,
      account_name: accountName,
      agency_id: s.agency_id,
      agency_name: agencyName,
    }
    try {
      const subscription = await stripe.subscriptions.update(subId, { metadata })
      updated++

      // Also tag the customer once per unique customer id.
      const customerId =
        typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id
      if (!customersDone.has(customerId)) {
        customersDone.add(customerId)
        await stripe.customers.update(customerId, {
          metadata: { agency_id: s.agency_id, agency_name: agencyName },
        })
      }
    } catch {
      failed++
    }
  }

  revalidatePath('/admin')
  redirect(`/admin?backfilled=${updated}&backfillFailed=${failed}`)
}

// Attaches a Stripe subscription that was created OUTSIDE our checkout flow
// (e.g. a client added a service directly in the Stripe customer portal) to
// an account on this agency -- either an existing one, or a brand-new one
// created from name/website, auto-provisioned a ClickUp List the same way a
// normal checkout would. Tags the subscription/customer with our usual
// account_id/agency_id metadata so it behaves identically to one that went
// through the platform from the start (renewal/cancellation webhooks,
// admin views, etc. all key off that metadata).
export async function attachExternalSubscription(formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!(await isAdmin(user?.email))) redirect('/dashboard')

  const agencyId = String(formData.get('agency_id') || '').trim()
  const subscriptionId = String(formData.get('subscription_id') || '').trim()
  const existingAccountId = String(formData.get('account_id') || '').trim()
  const name = String(formData.get('name') || '').trim()
  const website = String(formData.get('website') || '').trim()
  if (!agencyId || !subscriptionId) redirect('/admin')

  const admin = createAdminClient()
  const { data: agency } = await admin
    .from('agencies')
    .select('id, name, clickup_folder_id')
    .eq('id', agencyId)
    .maybeSingle()
  if (!agency) redirect('/admin')

  let accountId: string
  let accountName: string
  if (existingAccountId) {
    const { data: acct } = await admin
      .from('accounts')
      .select('id, name')
      .eq('id', existingAccountId)
      .maybeSingle()
    if (!acct) redirect(`/admin/agencies/${agencyId}?error=` + encodeURIComponent('Account not found.'))
    accountId = acct!.id
    accountName = acct!.name
  } else {
    if (!name) redirect(`/admin/agencies/${agencyId}?error=` + encodeURIComponent('Business name is required.'))
    const { data: account } = await admin
      .from('accounts')
      .insert({ agency_id: agencyId, name, website: website || null })
      .select('id, name')
      .single()
    if (!account) redirect(`/admin/agencies/${agencyId}?error=` + encodeURIComponent('Could not create account.'))
    accountId = account!.id
    accountName = account!.name

    if (agency.clickup_folder_id) {
      const list = await createList(agency.clickup_folder_id, accountName)
      if (list) await admin.from('accounts').update({ clickup_list_id: list.id }).eq('id', accountId)
    }
  }

  const metadata = {
    account_id: accountId,
    account_name: accountName,
    agency_id: agency.id,
    agency_name: agency.name,
  }

  try {
    const subscription = await stripe.subscriptions.update(subscriptionId, { metadata })
    const customerId =
      typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id
    await stripe.customers.update(customerId, {
      metadata: { agency_id: agency.id, agency_name: agency.name },
    })
    await upsertSubscriptionFromStripe(subscription)
  } catch {
    redirect(
      `/admin/agencies/${agencyId}?error=` +
        encodeURIComponent('Could not find or update that subscription in Stripe.')
    )
  }

  revalidatePath(`/admin/agencies/${agencyId}`)
  redirect(`/admin/agencies/${agencyId}`)
}
