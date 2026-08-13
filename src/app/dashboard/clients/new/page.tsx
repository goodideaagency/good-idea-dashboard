import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SubmitButton } from '@/components/submit-button'
import { createClientProfile } from '../actions'

const inputCls =
  'mt-1 w-full border border-[#e7e2d3] px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-900'

export default async function NewClientProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>
}) {
  const { error, next } = await searchParams
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const backHref = next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard/clients'

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold text-gray-900">New client profile</h1>
        <Link
          href={backHref}
          className="text-sm text-gray-700 hover:text-gray-900 font-mono uppercase tracking-wide"
        >
          Back
        </Link>
      </div>
      <p className="mt-1 text-sm text-gray-500">
        No payment required -- add this once, then use it for any service you request.
      </p>

      <div className="mt-6 max-w-xl bg-white p-6 ring-1 ring-[#ece7d8]">
        {error && <p className="mb-4 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <form action={createClientProfile} className="space-y-4">
          {next && <input type="hidden" name="next" value={next} />}
          <div>
            <label className="block text-sm font-medium text-gray-700" htmlFor="name">
              Client company name
            </label>
            <input id="name" name="name" type="text" required placeholder="Joe's Plumbing" className={inputCls} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700" htmlFor="website">
              Website <span className="font-normal text-gray-400">(optional)</span>
            </label>
            <input id="website" name="website" type="text" placeholder="joesplumbing.com" className={inputCls} />
          </div>
          <p className="text-xs text-gray-400">
            You can upload a logo and other files once the profile is created.
          </p>
          <SubmitButton
            pendingText="Creating…"
            className="bg-[#f7cf4a] px-4 py-2 text-sm font-semibold text-black hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Create profile
          </SubmitButton>
        </form>
      </div>
    </div>
  )
}
