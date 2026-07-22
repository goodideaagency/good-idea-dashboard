import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { listInvoicesForSubscription } from '@/lib/transactions'
import { listPlansForAgency } from '@/lib/plans'
import { AccountServices, type AccountService } from '@/components/account-services'
import { AddServiceForm } from '@/components/add-service-form'
import { ClickUpStatusPill } from '@/components/clickup-status-pill'
import { listTaskSummariesForAccount } from '@/lib/clickup'
import { addServiceAndCheckout } from '../../actions'
import { updateClientProfile } from '../../clients/actions'
import { updateSubscriptionState } from './actions'

const inputCls =
  'mt-1 w-full border border-[#e7e2d3] px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-900'

type AccountRow = {
  id: string
  name: string
  website: string | null
  logo_url: string | null
  clickup_list_id: string | null
  subscriptions: {
    stripe_subscription_id: string | null
    product_name: string | null
    status: string | null
    cancel_at_period_end: boolean | null
    current_period_end: string | null
    created_at: string | null
  }[]
}

export default async function AccountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Row-level security ensures this only returns an account in the user's agency.
  const { data: account } = await supabase
    .from('accounts')
    .select(
      'id, name, website, logo_url, clickup_list_id, subscriptions(stripe_subscription_id, product_name, status, cancel_at_period_end, current_period_end, created_at)'
    )
    .eq('id', id)
    .maybeSingle<AccountRow>()

  if (!account) redirect('/dashboard/clients')

  // The agency's name drives which plans are offered for the new service.
  const { data: membership } = await supabase
    .from('agency_users')
    .select('agencies(name)')
    .eq('user_id', user.id)
    .maybeSingle()
  const agencyName = (membership?.agencies as { name?: string } | null)?.name ?? ''
  const plans = await listPlansForAgency(agencyName)

  const subs = [...(account.subscriptions ?? [])].sort((a, b) =>
    (a.created_at ?? '').localeCompare(b.created_at ?? '')
  )

  // Lightweight only -- no comments/attachments here, this page is billing-only.
  // Full project details/comments live at /dashboard/projects/[taskId].
  const projectTasks = account.clickup_list_id
    ? await listTaskSummariesForAccount(account.clickup_list_id)
    : []

  // Fetch each service's transaction history (one Stripe call per subscription).
  const services: AccountService[] = await Promise.all(
    subs.map(async (s) => ({
      ...s,
      txns: s.stripe_subscription_id
        ? await listInvoicesForSubscription(s.stripe_subscription_id)
        : [],
    }))
  )

  return (
    <div className="p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-gray-900">{account.name}</h1>
          {account.website && <p className="mt-1 text-sm text-gray-500">{account.website}</p>}
        </div>
        <Link
          href="/dashboard/clients"
          className="border border-[#e7e2d3] px-3 py-1.5 text-sm text-gray-700 hover:bg-[#f6f1e4] font-mono uppercase tracking-wide"
        >
          ← Back to accounts
        </Link>
      </div>

      <div className="mx-auto mt-8 max-w-3xl">
        <p className="text-xs font-mono uppercase tracking-wide text-gray-400">Client profile</p>
        <form
          action={updateClientProfile}
          className="mt-4 grid gap-4 bg-white p-5 ring-1 ring-[#ece7d8] sm:grid-cols-2"
        >
          <input type="hidden" name="account_id" value={account.id} />
          <div>
            <label className="block text-sm font-medium text-gray-700" htmlFor="name">
              Client company name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              defaultValue={account.name}
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700" htmlFor="website">
              Website
            </label>
            <input
              id="website"
              name="website"
              type="text"
              defaultValue={account.website ?? ''}
              className={inputCls}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-700" htmlFor="logo_url">
              Logo URL
            </label>
            <input
              id="logo_url"
              name="logo_url"
              type="url"
              defaultValue={account.logo_url ?? ''}
              className={inputCls}
            />
          </div>
          <div className="sm:col-span-2">
            <button className="bg-[#f7cf4a] px-4 py-2 text-sm font-semibold text-black hover:brightness-95">
              Save profile
            </button>
          </div>
        </form>

        {projectTasks.length > 0 && (
          <>
            <p className="mt-10 text-xs font-mono uppercase tracking-wide text-gray-400">Project</p>
            <div className="mt-4 space-y-3">
              {projectTasks.map((t) => (
                <Link
                  key={t.id}
                  href={`/dashboard/projects/${t.id}`}
                  className="flex items-center justify-between bg-white p-4 ring-1 ring-[#ece7d8] hover:bg-gray-50"
                >
                  <span className="text-sm font-medium text-gray-900">{t.name}</span>
                  <span className="flex items-center gap-3">
                    <ClickUpStatusPill status={t.status} color={t.statusColor} />
                    <span className="text-gray-300">›</span>
                  </span>
                </Link>
              ))}
            </div>
          </>
        )}

        <p className="mt-10 text-xs font-mono uppercase tracking-wide text-gray-400">
          Services{services.length > 0 ? ` (${services.length})` : ''}
        </p>
        <div className="mt-4">
          <AccountServices
            accountId={account.id}
            services={services}
            action={updateSubscriptionState}
          />
        </div>

        <p className="mt-10 text-xs font-mono uppercase tracking-wide text-gray-400">
          Add another service
        </p>
        <div className="mt-4 bg-white p-5 ring-1 ring-[#ece7d8]">
          <AddServiceForm
            action={addServiceAndCheckout}
            plans={plans}
            accounts={[]}
            fixedAccountId={account.id}
          />
        </div>
      </div>
    </div>
  )
}
