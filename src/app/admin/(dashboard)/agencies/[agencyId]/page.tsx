import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAdminRole } from '@/lib/admin-auth'
import { calculateMrrCents, formatMoney } from '@/lib/mrr'
import { StatusBadges, planLabel } from '@/components/status-badge'
import { setAgencyArchived, impersonateUser, attachExternalSubscription, sendLoginLink } from '../../actions'
import { ArchiveAgencyButton } from '@/components/archive-agency-button'
import { CopyLinkResult } from '@/components/copy-link-result'

const inputCls =
  'mt-1 w-full border border-[#e7e2d3] px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-900'

export default async function AgencyDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ agencyId: string }>
  searchParams: Promise<{ error?: string; loginLink?: string; loginEmail?: string }>
}) {
  const { agencyId } = await params
  const { error, loginLink, loginEmail } = await searchParams
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
      .select('account_id, agency_id, product_name, status, amount_cents, interval')
      .eq('agency_id', agencyId),
    admin.from('agency_users').select('user_id, agency_id').eq('agency_id', agencyId),
  ])

  const agency = agencyRes.data
  if (!agency) redirect('/admin')

  const accounts = accountsRes.data ?? []
  const subs = subsRes.data ?? []
  const members = membersRes.data ?? []

  let memberEmails: { userId: string; email: string }[] = []
  if (members.length > 0) {
    try {
      const { data } = await admin.auth.admin.listUsers({ perPage: 1000 })
      memberEmails = members
        .map((m) => {
          const found = data.users.find((u) => u.id === m.user_id)
          return found?.email ? { userId: m.user_id as string, email: found.email } : null
        })
        .filter((m): m is { userId: string; email: string } => m !== null)
    } catch {
      // best effort
    }
  }
  const email = memberEmails[0]?.email

  const subsByAccount = new Map<string, typeof subs>()
  for (const s of subs) {
    if (!s.account_id) continue
    const list = subsByAccount.get(s.account_id) ?? []
    list.push(s)
    subsByAccount.set(s.account_id, list)
  }

  const agencyMrrCents = calculateMrrCents(subs)

  return (
    <div>
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
          className="text-sm text-gray-700 hover:text-gray-900 font-mono uppercase tracking-wide"
        >
          Back to agencies
        </Link>
      </div>

      {error && <p className="mt-4 max-w-2xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <span className="bg-[#F5EFE2] px-3 py-1.5 text-sm font-medium text-gray-900 ring-1 ring-[#ece7d8]">
          {formatMoney(agencyMrrCents)}/mo
        </span>
        <span className="text-sm text-gray-500">
          {accounts.length} account{accounts.length === 1 ? '' : 's'}
        </span>
      </div>

      {memberEmails.length > 0 && (
        <>
          <p className="mt-8 text-xs font-mono uppercase tracking-wide text-gray-400">Logins</p>
          <div className="mt-3 max-w-2xl divide-y divide-[#f2ede0] bg-white ring-1 ring-[#ece7d8]">
            {memberEmails.map((m) => (
              <div key={m.userId} className="flex items-center justify-between px-4 py-3">
                <span className="text-sm text-gray-900">{m.email}</span>
                <div className="flex items-center gap-2">
                  <form action={sendLoginLink}>
                    <input type="hidden" name="user_id" value={m.userId} />
                    <input type="hidden" name="agency_id" value={agency.id} />
                    <button className="border border-[#e7e2d3] px-2.5 py-1 text-xs text-gray-700 hover:bg-[#f6f1e4] font-mono uppercase tracking-wide">
                      Send login link
                    </button>
                  </form>
                  <form action={impersonateUser}>
                    <input type="hidden" name="user_id" value={m.userId} />
                    <button className="border border-[#e7e2d3] px-2.5 py-1 text-xs text-gray-700 hover:bg-[#f6f1e4] font-mono uppercase tracking-wide">
                      Impersonate
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </div>

          {loginLink && loginEmail && (
            <CopyLinkResult
              url={loginLink}
              heading="Login link generated ✓"
              description={
                <>
                  Send this link to <span className="font-medium">{loginEmail}</span> so they can
                  log in:
                </>
              }
              note="The link can be used once and expires after a while -- generate a new one if it wasn't used in time."
            />
          )}
        </>
      )}

      <p className="mt-8 text-xs font-mono uppercase tracking-wide text-gray-400">
        Attach existing Stripe subscription
      </p>
      <p className="mt-1 text-sm text-gray-500">
        For a subscription a client added directly in Stripe, outside the platform&apos;s checkout.
      </p>
      <form action={attachExternalSubscription} className="mt-3 max-w-2xl space-y-4 bg-white p-5 ring-1 ring-[#ece7d8]">
        <input type="hidden" name="agency_id" value={agency.id} />
        <div>
          <label className="block text-sm font-medium text-gray-700" htmlFor="subscription_id">
            Stripe subscription ID
          </label>
          <input
            id="subscription_id"
            name="subscription_id"
            type="text"
            required
            placeholder="sub_..."
            className={`${inputCls} font-mono`}
          />
        </div>

        {accounts.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700" htmlFor="account_id">
              Account <span className="font-normal text-gray-400">(leave as New account below to create one)</span>
            </label>
            <select id="account_id" name="account_id" defaultValue="" className={inputCls}>
              <option value="">+ New account</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-gray-700" htmlFor="name">
              New account business name
            </label>
            <input id="name" name="name" type="text" placeholder="Nations Pure" className={inputCls} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700" htmlFor="website">
              Website <span className="font-normal text-gray-400">(optional)</span>
            </label>
            <input id="website" name="website" type="text" placeholder="nationspure.com" className={inputCls} />
          </div>
        </div>

        <button className="bg-[#f7cf4a] px-4 py-2 text-sm font-semibold text-black hover:brightness-95">
          Attach subscription
        </button>
      </form>

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

      <div className="mt-10 border-t border-[#ece7d8] pt-6">
        <ArchiveAgencyButton agencyId={agency.id} agencyName={agency.name} action={setAgencyArchived} />
      </div>
    </div>
  )
}
