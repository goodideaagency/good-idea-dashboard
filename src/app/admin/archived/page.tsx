import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAdminRole } from '@/lib/admin-auth'
import { setAgencyArchived } from '../actions'

export default async function ArchivedAgenciesPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const role = await getAdminRole(user.email)
  if (!role) redirect('/dashboard')

  const admin = createAdminClient()
  const [agenciesRes, accountsRes] = await Promise.all([
    admin
      .from('agencies')
      .select('id, name, stripe_customer_id, created_at')
      .eq('archived', true)
      .order('created_at'),
    admin.from('accounts').select('id, agency_id'),
  ])

  const agencies = agenciesRes.data ?? []
  const accounts = accountsRes.data ?? []
  const countByAgency = new Map<string, number>()
  for (const a of accounts) {
    countByAgency.set(a.agency_id, (countByAgency.get(a.agency_id) ?? 0) + 1)
  }

  return (
    <main className="min-h-screen">
      <header className="flex items-center justify-between border-b border-[#ece7d8] bg-white px-6 py-4">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Archived agencies</h1>
          <p className="text-sm text-gray-500">Hidden from the main admin view. Nothing in Stripe is affected.</p>
        </div>
        <Link
          href="/admin"
          className="rounded-lg border border-[#e7e2d3] px-3 py-1.5 text-sm text-gray-700 hover:bg-[#f6f1e4] font-mono uppercase tracking-wide"
        >
          ← Back to admin
        </Link>
      </header>

      <section className="mx-auto max-w-3xl p-6">
        {agencies.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#e7e2d3] bg-white p-8 text-center">
            <p className="text-sm text-gray-500">No archived agencies.</p>
          </div>
        ) : (
          <ul className="divide-y divide-[#f0ecdf] rounded-xl bg-white ring-1 ring-[#ece7d8]">
            {agencies.map((agency) => {
              const count = countByAgency.get(agency.id) ?? 0
              return (
                <li key={agency.id} className="flex items-center justify-between px-5 py-4">
                  <div>
                    <p className="font-medium text-gray-900">{agency.name}</p>
                    <p className="text-sm text-gray-500">
                      {count} account{count === 1 ? '' : 's'}
                      {agency.stripe_customer_id && (
                        <span className="ml-2 font-mono text-xs text-gray-400">
                          {agency.stripe_customer_id}
                        </span>
                      )}
                    </p>
                  </div>
                  <form action={setAgencyArchived}>
                    <input type="hidden" name="agency_id" value={agency.id} />
                    <input type="hidden" name="archived" value="false" />
                    <button className="rounded-lg bg-[#f7cf4a] px-3 py-1.5 text-sm font-semibold text-black hover:brightness-95 font-mono uppercase tracking-wide">
                      Unarchive
                    </button>
                  </form>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </main>
  )
}
