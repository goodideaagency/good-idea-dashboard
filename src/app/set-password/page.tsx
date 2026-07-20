import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Logo } from '@/components/logo'
import { setPassword } from './actions'

const inputCls =
  'mt-1 w-full rounded-lg border border-[#e7e2d3] px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-900'

export default async function SetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  // Only reachable right after clicking a valid invite/recovery link.
  if (!user) {
    redirect('/login?error=' + encodeURIComponent('Your link has expired. Ask your admin to resend it.'))
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm ring-1 ring-[#ece7d8]">
        <Logo height={22} />
        <h1 className="mt-4 text-xl font-semibold text-gray-900">Set your password</h1>
        <p className="mt-1 text-sm text-gray-500">
          Welcome{user.email ? `, ${user.email}` : ''}. Choose a password to finish setting up your account.
        </p>

        {error && (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}

        <form className="mt-6 space-y-4" action={setPassword}>
          <div>
            <label className="block text-sm font-medium text-gray-700" htmlFor="password">
              New password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              className={inputCls}
            />
          </div>
          <button className="w-full rounded-lg bg-[#f7cf4a] px-4 py-2 text-sm font-semibold text-black hover:brightness-95">
            Save password
          </button>
        </form>
      </div>
    </main>
  )
}
