import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { StatusBadges, planLabel } from '@/components/status-badge'

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

export default async function ClientsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: accounts } = await supabase
    .from('accounts')
    .select(
      'id, name, website, subscriptions(status, product_name, current_period_end)'
    )
    .order('created_at', { ascending: true })
    .returns<AccountRow[]>()

  const accountList = accounts ?? []

  return (
    <div className="p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <h1 className="text-4xl font-semibold text-gray-900">My Clients</h1>
        <div className="text-right">
          <p className="text-xs font-mono uppercase tracking-wide text-gray-400">
            Total accounts
          </p>
          <p className="text-3xl font-semibold text-gray-900">{accountList.length}</p>
        </div>
      </div>

      <div className="mt-10 flex items-baseline justify-between">
        <p className="text-xs font-mono uppercase tracking-wide text-gray-400">
          Managed accounts
        </p>
        <Link
          href="/dashboard/clients/new"
          className="border border-[#e7e2d3] px-3 py-1.5 text-xs text-gray-700 hover:bg-[#f6f1e4] font-mono uppercase tracking-wide"
        >
          + New client profile
        </Link>
      </div>

      {accountList.length === 0 ? (
        <div className="mt-4 border border-dashed border-[#e7e2d3] bg-white p-8 text-center">
          <p className="text-sm text-gray-500">
            No accounts yet.{' '}
            <Link href="/dashboard/clients/new" className="underline underline-offset-2">
              Add your first one.
            </Link>
          </p>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {accountList.map((a) => {
            const subs = a.subscriptions ?? []
            return (
              <div
                key={a.id}
                className="flex flex-col justify-between bg-[#F5EFE2] p-6 ring-1 ring-[#ece7d8]"
              >
                <div>
                  <p className="text-lg font-semibold text-gray-900">{a.name}</p>
                  <p className="mt-1 text-sm text-gray-600">{planLabel(subs)}</p>
                  <div className="mt-4">
                    {subs.length > 0 ? (
                      <StatusBadges statuses={subs.map((s) => s.status)} />
                    ) : (
                      <span className="text-xs text-gray-400">No subscription yet</span>
                    )}
                  </div>
                </div>
                <Link
                  href={`/dashboard/accounts/${a.id}`}
                  className="mt-8 flex items-center justify-center gap-2 bg-[#1a1a1a] px-4 py-2.5 text-sm font-semibold text-white hover:brightness-110"
                >
                  Manage <span aria-hidden="true">→</span>
                </Link>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
