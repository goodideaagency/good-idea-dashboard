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
  if (!user) redirect('/admin/login')
  // Only the superadmin can manage the approved-admin list.
  if (!(await isSuperadmin(user.email))) redirect('/admin')

  const admin = createAdminClient()
  const { data } = await admin
    .from('admins')
    .select('email, role, created_at')
    .order('created_at')
  const admins = (data ?? []) as AdminRow[]

  return (
    <div className="p-8">
      <h1 className="text-3xl font-semibold text-gray-900">Admin access</h1>
      <p className="mt-1 text-sm text-gray-500">Who can open the admin area</p>

      <div className="mx-auto mt-6 max-w-2xl">
        <h2 className="text-base font-semibold text-gray-900">Add an admin</h2>
        <form
          action={addAdmin}
          className="mt-3 flex flex-col gap-3 bg-white p-4 ring-1 ring-[#ece7d8] sm:flex-row sm:items-end"
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
              className="mt-1 w-full border border-[#e7e2d3] px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-900"
            />
          </div>
          <button className="bg-[#f7cf4a] px-4 py-2 text-sm font-semibold text-black hover:brightness-95">
            Add admin
          </button>
        </form>
        <p className="mt-2 text-xs text-gray-500">
          They still sign in with their own email + password. Adding them here is what unlocks
          the admin area for that email.
        </p>

        <h2 className="mt-8 text-base font-semibold text-gray-900">Approved admins</h2>
        <ul className="mt-3 divide-y divide-[#f0ecdf] bg-white ring-1 ring-[#ece7d8]">
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
                  <button className="border border-[#e7e2d3] px-3 py-1.5 text-sm text-red-600 hover:bg-red-50">
                    Remove
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
