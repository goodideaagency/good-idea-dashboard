import Link from 'next/link'
import { redirect } from 'next/navigation'
import type Stripe from 'stripe'
import { Logo } from '@/components/logo'
import { createClient } from '@/lib/supabase/server'
import { stripe } from '@/lib/stripe'
import { signout } from '../login/actions'
import { addAccountAndCheckout } from './actions'

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

  // Plans this agency may add. Opt-in via Stripe product metadata:
  //   billing_visible = "true"           -> shown to every agency
  //   billing_agency  = "Agency Name"    -> shown only to that agency
  //                                         (comma-separate for several)
  // Untagged products never appear in the platform.
  const agencyKey = agencyName.trim().toLowerCase()
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
        <h2 className="text-base font-semibold text-gray-900">Add a client account</h2>

        <form
          action={addAccountAndCheckout}
          className="mt-4 space-y-4 rounded-xl bg-white p-5 ring-1 ring-[#ece7d8]"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700" htmlFor="name">
                Business name
              </label>
              <input
                id="name"
                name="name"
                type="text"
                required
                placeholder="Joe's Plumbing"
                className="mt-1 w-full rounded-lg border border-[#e7e2d3] px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700" htmlFor="website">
                Website <span className="font-normal text-gray-400">(optional)</span>
              </label>
              <input
                id="website"
                name="website"
                type="text"
                placeholder="joesplumbing.com"
                className="mt-1 w-full rounded-lg border border-[#e7e2d3] px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-900"
              />
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-gray-700">Choose a plan</p>
            {plans.length === 0 ? (
              <p className="mt-2 text-sm text-gray-500">
                No plans available for your account yet. Contact Good Idea to get set up.
              </p>
            ) : (
              <div className="mt-2 space-y-2">
                {plans.map((plan, i) => (
                  <label
                    key={plan.id}
                    className="flex cursor-pointer items-center gap-3 rounded-lg border border-[#e7e2d3] px-3 py-2 text-sm has-[:checked]:border-gray-900 has-[:checked]:bg-gray-50"
                  >
                    <input
                      type="radio"
                      name="priceId"
                      value={plan.id}
                      defaultChecked={i === 0}
                      required
                    />
                    <span className="text-gray-900">{plan.label}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <button className="rounded-lg bg-[#f7cf4a] px-4 py-2 text-sm font-semibold text-black hover:brightness-95">
            Add account &amp; continue to payment
          </button>
        </form>

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
