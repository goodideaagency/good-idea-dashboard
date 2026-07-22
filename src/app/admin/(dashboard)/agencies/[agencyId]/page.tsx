import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAdminRole } from '@/lib/admin-auth'
import { calculateMrrCents, formatMoney } from '@/lib/mrr'
import { StatusBadges, planLabel } from '@/components/status-badge'
import { setAgencyArchived } from '../../actions'

export default async function AgencyDetailPage({
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
  const role = await getAdminRole(user.email)
  if (!role) redirect('/dashboard')

  const admin = createAdminClient()
  const [agencyRes, accountsRes, subsRes, membersRes] = await Promise.all([
    admin
      .from('agencies')
      .select('id, name, stripe_customer_id, archived')
      .eq('id', agencyId)
      .maybeSingle(),
    admin
      .from('accounts')
      .select('id, name, website')
      .eq('agency_id', agencyId)
      .order('created_at'),
    admin
      .from('subscriptions')
      .select('account_id, agency_id, product_name, status, amount_cents, interval'),
    admin.from('agency_users').select('user_id, agency_id').eq('agency_id', agencyId),
  ])

  const agency = agencyRes.data
  if (!agency) redirect('/admin')

  const accounts = accountsRes.data ?? []
  const subs = subsRes.data ?? []
  const members = membersRes.data ?? []

  let email: string | undefined
  if (members[0]) {
    try {
      const { data } = await admin.auth.admin.listUsers({ perPage: 1000 })
      email = data.users.find((u) => u.id === members[0].user_id)?.email
    } catch {
      // best effort
    }
  }

  const subsByAccount = new Map<string, typeof subs>()
  for (const s of subs) {
    if (!s.account_id) continue
    const list = subsByAccount.get(s.account_id) ?? []
    list.push(s)
    subsByAccount.set(s.account_id, list)
  }

  const agencyMrrCents = calculateMrrCents(subs.filter((s) => s.agency_id === agencyId))

  return (
    <div className="p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-gray-900">{agency.name}</h1>
          <p className="mt-1 text-sm text-gray-500">
            {email ?? 'no login on file'}
            {agency.stripe_customer_id && (
              <span className="ml-2 font-mono text-xs text-gray-400">
                {agency.stripe_customer_id}
              </span>
            )}
          </p>
        </div>
        <Link
          href="/admin"
          className="border border-[#e7e2d3] px-3 py-1.5 text-sm text-gray-700 hover:bg-[#f6f1e4] font-mono uppercase tracking-wide"
        >
          ← Back to agencies
        </Link>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <span className="bg-[#F5EFE2] px-3 py-1.5 text-sm font-medium text-gray-900 ring-1 ring-[#ece7d8]">
          {formatMoney(agencyMrrCents)}/mo
        </span>
        <span className="text-sm text-gray-500">
          {accounts.length} account{accounts.length === 1 ? '' : 's'}
        </span>
        <Link
          href={`/admin/view-as/${agency.id}`}
          className="border border-[#e7e2d3] px-2.5 py-1 text-xs text-gray-700 hover:bg-[#f6f1e4] font-mono uppercase tracking-wide"
        >
          View
        </Link>
        <form action={setAgencyArchived}>
          <input type="hidden" name="agency_id" value={agency.id} />
          <input type="hidden" name="archived" value="true" />
          <button className="border border-[#e7e2d3] px-2.5 py-1 text-xs text-gray-700 hover:bg-[#f6f1e4] font-mono uppercase tracking-wide">
            Archive
          </button>
        </form>
      </div>

      {accounts.length === 0 ? (
        <div className="mt-6 border border-dashed border-[#e7e2d3] bg-white p-8 text-center">
          <p className="text-sm text-gray-500">No accounts yet.</p>
        </div>
      ) : (
        <table className="mt-6 w-full max-w-4xl text-sm ring-1 ring-[#ece7d8]">
          <thead>
            <tr className="bg-white text-left text-xs uppercase tracking-wide text-gray-400">
              <th className="px-5 py-2 font-medium">Account</th>
              <th className="px-5 py-2 font-medium">Plan</th>
              <th className="px-5 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f2ede0] bg-white">
            {accounts.map((acc) => {
              const accSubs = subsByAccount.get(acc.id) ?? []
              return (
                <tr key={acc.id}>
                  <td className="px-5 py-3">
                    <Link
                      href={`/admin/accounts/${acc.id}`}
                      className="font-medium text-gray-900 underline-offset-2 hover:underline"
                    >
                      {acc.name}
                    </Link>
                    {acc.website && <p className="text-xs text-gray-500">{acc.website}</p>}
                  </td>
                  <td className="px-5 py-3 text-gray-700">{planLabel(accSubs)}</td>
                  <td className="px-5 py-3">
                    {accSubs.length === 0 ? (
                      <span className="text-xs text-gray-400">No subscription</span>
                    ) : (
                      <StatusBadges statuses={accSubs.map((s) => s.status)} />
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
