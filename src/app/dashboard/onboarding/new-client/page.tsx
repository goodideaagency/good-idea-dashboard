import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { completeNewClientSetup } from './actions'

const inputCls =
  'mt-1 w-full border border-[#e7e2d3] px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-900'

// The one thing signup deliberately didn't ask for: who is this managed
// service actually for. Lands here right after payment, before the
// service's own detailed intake questions.
export default async function NewClientSetupPage({
  searchParams,
}: {
  searchParams: Promise<{ price_id?: string; error?: string }>
}) {
  const { price_id, error } = await searchParams
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  if (!price_id) redirect('/dashboard')

  return (
    <div>
      <h1 className="text-3xl font-semibold text-gray-900">Tell us about your client</h1>
      <p className="mt-1 text-sm text-gray-500">
        Payment received -- just need a couple of details to get this started.
      </p>

      <div className="mt-6 max-w-xl bg-white p-6 ring-1 ring-[#ece7d8]">
        {error && <p className="mb-4 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <form action={completeNewClientSetup} className="space-y-4">
          <input type="hidden" name="price_id" value={price_id} />
          <div>
            <label className="block text-sm font-medium text-gray-700" htmlFor="name">
              Business name
            </label>
            <input id="name" name="name" type="text" required placeholder="Joe's Plumbing" className={inputCls} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700" htmlFor="website">
              Website <span className="font-normal text-gray-400">(optional)</span>
            </label>
            <input id="website" name="website" type="text" placeholder="joesplumbing.com" className={inputCls} />
          </div>

          <button className="bg-[#f7cf4a] px-4 py-2 text-sm font-semibold text-black hover:brightness-95">
            Continue
          </button>
        </form>
      </div>
    </div>
  )
}
