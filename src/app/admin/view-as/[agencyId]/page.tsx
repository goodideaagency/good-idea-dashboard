import Link from 'next/link'
import { redirect } from 'next/navigation'
import type Stripe from 'stripe'
import { Logo } from '@/components/logo'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAdmin } from '@/lib/admin-auth'
import { stripe } from '@/lib/stripe'

type PlanOption = { id: string; label: string; amount: number }

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

function money(cents: number) {
  return `$${(cents / 100).toLocaleString('en-US')}`
}

export default async function ViewAsAgencyPage({
  params,
}: {
  params: Promise<{ agencyId: string }>
}) {
  const { agencyId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/admin/login')
  if (!(await isAdmin(user.email))) redirect('/dashboard')

  const admin = createAdminClient()

  const { data: agency } = await admin
    .from('agencies')
    .select('id, name')
    .eq('id', agencyId)
    .maybeSingle()

  if (!agency) redirect('/admin')

  const { data: accounts } = await admin
    .from('accounts')
    .select('id, name, website, subscriptions(status, product_name, current_period_end)')
    .eq('agency_id', agencyId)
    .order('created_at', { ascending: true })
    .returns<AccountRow[]>()

  const agencyKey = agency.name.trim().toLowerCase()
  let plans: PlanOption[] = []
  try {
    const prices = await stripe.prices.list({
      active: true,
      type: 'recurring',
      expand: ['data.product'],
      limit: 100,
    })
    plans = prices.data
      .filter((p) => {
        const meta = (p.product as Stripe.Product)?.metadata ?? {}
        if (meta.billing_visible === 'true') return true
        const restricted = (meta.billing_agency ?? '')
          .split(',')
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean)
        return restricted.includes(agencyKey)
      })
      .map((p) => {
        const product = p.product as Stripe.Product
        const amount = p.unit_amount ?? 0
        const interval = p.recurring?.interval ?? 'month'
        return {
          id: p.id,
          amount,
          label: `${product.name} — ${money(amount)}/${interval}`,
        }
      })
      .sort((a, b) => a.amount - b.amount)
  } catch {
    plans = []
  }

  return (
    <main className="min-h-screen">
      <div className="bg-[#f7cf4a] px-6 py-2 text-center text-xs font-semibold uppercase tracking-wide text-black font-mono">
        Admin view — read only — viewing as {agency.name}
      </div>

      <header className="flex items-center justify-between border-b border-[#ece7d8] bg-white px-6 py-4">
        <div className="flex items-center gap-3">
          <Logo height={20} />
          <div className="h-6 w-px bg-[#ece7d8]" />
          <div>
            <h1 className="text-lg font-semibold text-gray-900">{agency.name}</h1>
            <p className="text-sm text-gray-500">Viewed by admin</p>
          </div>
        </div>
        <Link
          href="/admin"
          className="rounded-lg border border-[#e7e2d3] px-3 py-1.5 text-sm text-gray-700 hover:bg-[#f6f1e4] font-mono uppercase tracking-wide"
        >
          ← Exit view
        </Link>
      </header>

      <section className="mx-auto max-w-3xl p-6">
        <h2 className="text-base font-semibold text-gray-900">Plans available to this agency</h2>
        <div className="mt-4 rounded-xl bg-white p-5 ring-1 ring-[#ece7d8]">
          {plans.length === 0 ? (
            <p className="text-sm text-gray-500">
              No plans available for this agency yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {plans.map((plan) => (
                <li
                  key={plan.id}
                  className="rounded-lg border border-[#e7e2d3] px-3 py-2 text-sm text-gray-900"
                >
                  {plan.label}
                </li>
              ))}
            </ul>
          )}
        </div>

        <h2 className="mt-8 text-base font-semibold text-gray-900">Accounts</h2>
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
                    href={`/admin/accounts/${a.id}`}
                    className="flex items-center justify-between px-4 py-3 hover:bg-gray-50"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-900">{a.name}</p>
                      {a.website && <p className="text-sm text-gray-500">{a.website}</p>}
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
            <p className="text-sm text-gray-500">No accounts yet.</p>
          </div>
        )}
      </section>
    </main>
  )
}
