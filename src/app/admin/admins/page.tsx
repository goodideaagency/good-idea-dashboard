import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isSuperadmin } from '@/lib/admin-auth'
import { addAdmin, removeAdmin } from './actions'

type AdminRow = { email: string; role: string; created_at: string }

export default async function AdminsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  // Only the superadmin can manage the approved-admin list.
  if (!(await isSuperadmin(user.email))) redirect('/admin')

  const admin = createAdminClient()
  const { data } = await admin
    .from('admins')
    .select('email, role, created_at')
    .order('created_at')
  const admins = (data ?? []) as AdminRow[]

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Admin access</h1>
          <p className="text-sm text-gray-500">Who can open the admin area</p>
        </div>
        <Link
          href="/admin"
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
        >
          ← Back to admin
        </Link>
      </header>

      <section className="mx-auto max-w-2xl p-6">
        <h2 className="text-base font-semibold text-gray-900">Add an admin</h2>
        <form
          action={addAdmin}
          className="mt-3 flex flex-col gap-3 rounded-xl bg-white p-4 ring-1 ring-gray-200 sm:flex-row sm:items-end"
        >
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700" htmlFor="email">
              Email address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              placeholder="teammate@itsgoodidea.com"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-900"
            />
          </div>
          <button className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800">
            Add admin
          </button>
        </form>
        <p className="mt-2 text-xs text-gray-500">
          They still sign in with their own email + password. Adding them here is what unlocks
          the admin area for that email.
        </p>

        <h2 className="mt-8 text-base font-semibold text-gray-900">Approved admins</h2>
        <ul className="mt-3 divide-y divide-gray-200 rounded-xl bg-white ring-1 ring-gray-200">
          {admins.map((a) => (
            <li key={a.email} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm font-medium text-gray-900">{a.email}</p>
                <span
                  className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                    a.role === 'superadmin'
                      ? 'bg-indigo-100 text-indigo-800'
                      : 'bg-gray-100 text-gray-700'
                  }`}
                >
                  {a.role}
                </span>
              </div>
              {a.role === 'superadmin' ? (
                <span className="text-xs text-gray-400">master account</span>
              ) : (
                <form action={removeAdmin}>
                  <input type="hidden" name="email" value={a.email} />
                  <button className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50">
                    Remove
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}
