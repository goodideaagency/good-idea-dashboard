import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isAdmin } from '@/lib/admin-auth'
import { createAgency } from './actions'
import { InviteResult } from './invite-result'

export default async function NewAgencyPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; invite?: string; agency?: string; email?: string }>
}) {
  const { error, invite, agency, email } = await searchParams

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  if (!(await isAdmin(user.email))) redirect('/dashboard')

  return (
    <main className="min-h-screen">
      <header className="flex items-center justify-between border-b border-[#ece7d8] bg-white px-6 py-4">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">New agency</h1>
          <p className="text-sm text-gray-500">Create a client agency and invite its owner</p>
        </div>
        <Link
          href="/admin"
          className="rounded-lg border border-[#e7e2d3] px-3 py-1.5 text-sm text-gray-700 hover:bg-[#f6f1e4] font-mono uppercase tracking-wide"
        >
          ← Back to admin
        </Link>
      </header>

      <section className="mx-auto max-w-2xl p-6">
        {error && (
          <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}

        <form action={createAgency} className="space-y-4 rounded-xl bg-white p-5 ring-1 ring-[#ece7d8]">
          <div>
            <label className="block text-sm font-medium text-gray-700" htmlFor="name">
              Agency name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              placeholder="Acme Marketing"
              className="mt-1 w-full rounded-lg border border-[#e7e2d3] px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-900"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700" htmlFor="email">
              Owner email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              placeholder="owner@acme.com"
              className="mt-1 w-full rounded-lg border border-[#e7e2d3] px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-900"
            />
            <p className="mt-1 text-xs text-gray-500">
              This is who logs in for the agency. You&apos;ll get a link to send them.
            </p>
          </div>
          <button className="rounded-lg bg-[#f7cf4a] px-4 py-2 text-sm font-semibold text-black hover:brightness-95">
            Create agency &amp; generate invite
          </button>
        </form>

        {invite && agency && email && (
          <InviteResult url={invite} agency={agency} email={email} />
        )}
      </section>
    </main>
  )
}
