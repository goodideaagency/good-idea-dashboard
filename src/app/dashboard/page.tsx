import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Logo } from '@/components/logo'
import { createClient } from '@/lib/supabase/server'
import { listPlansForAgency } from '@/lib/plans'
import { AddServiceForm } from '@/components/add-service-form'
import { signout } from '../login/actions'
import { addServiceAndCheckout } from './actions'

type AccountRow = {
  id: string
  name: string
  website: string | null
  subscriptions: {
    status: string | null
    product_name: string | null
    current_period_end: string | null
  }[]
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: membership } = await supabase
    .from('agency_users')
    .select('agency_id, agencies(name)')
    .eq('user_id', user.id)
    .maybeSingle()

  const agencyName =
    (membership?.agencies as { name?: string } | null)?.name ?? 'your agency'

  const { data: accounts } = await supabase
    .from('accounts')
    .select(
      'id, name, website, subscriptions(status, product_name, current_period_end)'
    )
    .order('created_at', { ascending: true })
    .returns<AccountRow[]>()

  const plans = await listPlansForAgency(agencyName)
  const accountOptions = (accounts ?? []).map((a) => ({ id: a.id, name: a.name }))

  return (
    <main className="min-h-screen">
      <header className="flex items-center justify-between border-b border-[#ece7d8] bg-white px-6 py-4">
        <div className="flex items-center gap-3">
          <Logo height={20} />
          <div className="h-6 w-px bg-[#ece7d8]" />
          <div>
            <h1 className="text-lg font-semibold text-gray-900">{agencyName}</h1>
            <p className="text-sm text-gray-500">{user.email}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/transactions"
            className="rounded-lg border border-[#e7e2d3] px-3 py-1.5 text-sm text-gray-700 hover:bg-[#f6f1e4] font-mono uppercase tracking-wide"
          >
            Transactions
          </Link>
          <form action={signout}>
            <button className="rounded-lg border border-[#e7e2d3] px-3 py-1.5 text-sm text-gray-700 hover:bg-[#f6f1e4] font-mono uppercase tracking-wide">
              Sign out
            </button>
          </form>
        </div>
      </header>

      <section className="mx-auto max-w-3xl p-6">
        <h2 className="text-base font-semibold text-gray-900">Add a service</h2>

        <div className="mt-4 rounded-xl bg-white p-5 ring-1 ring-[#ece7d8]">
          <AddServiceForm
            action={addServiceAndCheckout}
            plans={plans}
            accounts={accountOptions}
          />
        </div>

        <h2 className="mt-8 text-base font-semibold text-gray-900">Your accounts</h2>
        {accounts && accounts.length > 0 ? (
          <ul className="mt-4 divide-y divide-[#f0ecdf] rounded-xl bg-white ring-1 ring-[#ece7d8]">
            {accounts.map((a) => {
              const subs = a.subscriptions ?? []
              const activeCount = subs.filter(
                (s) => s.status === 'active' || s.status === 'trialing'
              ).length
              return (
                <li key={a.id}>
                  <Link
                    href={`/dashboard/accounts/${a.id}`}
                    className="flex items-center justify-between px-4 py-3 hover:bg-gray-50"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-900">{a.name}</p>
                      {a.website && (
                        <p className="text-sm text-gray-500">{a.website}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-right">
                      <div>
                        {subs.length > 0 ? (
                          <>
                            <p className="text-sm text-gray-900">
                              {subs.length} service{subs.length === 1 ? '' : 's'}
                            </p>
                            <p className="text-xs text-gray-500">{activeCount} active</p>
                          </>
                        ) : (
                          <span className="text-xs text-gray-400">No subscription yet</span>
                        )}
                      </div>
                      <span className="text-gray-300">›</span>
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        ) : (
          <div className="mt-4 rounded-xl border border-dashed border-[#e7e2d3] bg-white p-8 text-center">
            <p className="text-sm text-gray-500">
              No accounts yet. Add your first one above.
            </p>
          </div>
        )}
      </section>
    </main>
  )
}
