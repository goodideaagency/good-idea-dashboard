import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { listInvoicesForSubscription } from '@/lib/transactions'
import { listPlansForAgency } from '@/lib/plans'
import { AccountServices, type AccountService } from '@/components/account-services'
import { AddServiceForm } from '@/components/add-service-form'
import { ProjectTasks } from '@/components/project-tasks'
import { listTasksForAccount } from '@/lib/clickup'
import { addServiceAndCheckout } from '../../actions'
import { updateSubscriptionState, postAccountTaskComment } from './actions'

type AccountRow = {
  id: string
  name: string
  website: string | null
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
      'id, name, website, clickup_list_id, subscriptions(stripe_subscription_id, product_name, status, cancel_at_period_end, current_period_end, created_at)'
    )
    .eq('id', id)
    .maybeSingle<AccountRow>()

  if (!account) redirect('/dashboard')

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

  const tasks = account.clickup_list_id
    ? await listTasksForAccount(account.clickup_list_id)
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
          href="/dashboard"
          className="border border-[#e7e2d3] px-3 py-1.5 text-sm text-gray-700 hover:bg-[#f6f1e4] font-mono uppercase tracking-wide"
        >
          ← Back to accounts
        </Link>
      </div>

      <div className="mx-auto mt-8 max-w-3xl">
        {account.clickup_list_id && (
          <>
            <p className="text-xs font-mono uppercase tracking-wide text-gray-400">Project</p>
            <div className="mt-4">
              <ProjectTasks
                tasks={tasks}
                accountId={account.id}
                commentAction={postAccountTaskComment}
              />
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
