import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAdmin } from '@/lib/admin-auth'
import { listInvoicesForSubscription } from '@/lib/transactions'
import { AccountServices, type AccountService } from '@/components/account-services'
import { ProjectTasks } from '@/components/project-tasks'
import { listTasksForAccount } from '@/lib/clickup'
import { updateSubscriptionStateAdmin, updateAccountClickupList } from './actions'

type AccountRow = {
  id: string
  name: string
  website: string | null
  clickup_list_id: string | null
  agencies: { name?: string } | null
  subscriptions: {
    stripe_subscription_id: string | null
    product_name: string | null
    status: string | null
    cancel_at_period_end: boolean | null
    current_period_end: string | null
    created_at: string | null
  }[]
}

export default async function AdminAccountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/admin/login')
  if (!(await isAdmin(user.email))) redirect('/dashboard')

  const admin = createAdminClient()
  const { data: account } = await admin
    .from('accounts')
    .select(
      'id, name, website, clickup_list_id, agencies(name), subscriptions(stripe_subscription_id, product_name, status, cancel_at_period_end, current_period_end, created_at)'
    )
    .eq('id', id)
    .maybeSingle<AccountRow>()

  if (!account) redirect('/admin')

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
          <p className="mt-1 text-sm text-gray-500">
            {account.agencies?.name ?? 'Unknown agency'}
            {account.website ? ` · ${account.website}` : ''}
          </p>
        </div>
        <Link
          href="/admin"
          className="border border-[#e7e2d3] px-3 py-1.5 text-sm text-gray-700 hover:bg-[#f6f1e4] font-mono uppercase tracking-wide"
        >
          ← Back to agencies
        </Link>
      </div>

      <div className="mx-auto mt-8 max-w-3xl">
        <p className="text-xs font-mono uppercase tracking-wide text-gray-400">Project</p>
        <form
          action={updateAccountClickupList}
          className="mt-4 flex flex-wrap items-end gap-3 bg-white p-5 ring-1 ring-[#ece7d8]"
        >
          <input type="hidden" name="account_id" value={account.id} />
          <div className="flex-1">
            <label
              className="block text-xs uppercase tracking-wide text-gray-400"
              htmlFor="clickup_list_id"
            >
              ClickUp List ID
            </label>
            <input
              id="clickup_list_id"
              name="clickup_list_id"
              type="text"
              defaultValue={account.clickup_list_id ?? ''}
              placeholder="e.g. 901418306348"
              className="mt-1 w-full border border-[#e7e2d3] px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-900"
            />
          </div>
          <button className="bg-[#f7cf4a] px-4 py-2 text-sm font-semibold text-black hover:brightness-95">
            Save
          </button>
        </form>
        {account.clickup_list_id && (
          <div className="mt-4">
            <ProjectTasks tasks={tasks} />
          </div>
        )}

        <p className="mt-10 text-xs font-mono uppercase tracking-wide text-gray-400">
          Services{services.length > 0 ? ` (${services.length})` : ''}
        </p>
        <div className="mt-4">
          <AccountServices
            accountId={account.id}
            services={services}
            action={updateSubscriptionStateAdmin}
          />
        </div>
      </div>
    </div>
  )
}
