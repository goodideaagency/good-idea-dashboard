import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { updateName, updateEmail, sendPasswordReset } from './actions'

const inputCls =
  'mt-1 w-full border border-[#e7e2d3] px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-900'

const SAVED_MESSAGES: Record<string, string> = {
  name: 'Your name was updated.',
  email: 'Check your inbox to confirm the new email address.',
  'password-email': 'Check your inbox for a link to reset your password.',
}

export default async function AccountSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>
}) {
  const { error, saved } = await searchParams
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const currentName = (user.user_metadata as { full_name?: string })?.full_name ?? ''

  return (
    <div className="p-8">
      <h1 className="text-3xl font-semibold text-gray-900">Account settings</h1>
      <p className="mt-1 text-sm text-gray-500">Update your name, email, and password.</p>

      <div className="mx-auto mt-8 max-w-xl space-y-6">
        {error && <p className="bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {saved && SAVED_MESSAGES[saved] && (
          <p className="bg-green-50 px-3 py-2 text-sm text-green-700">{SAVED_MESSAGES[saved]}</p>
        )}

        <div className="bg-white p-5 ring-1 ring-[#ece7d8]">
          <p className="text-xs font-mono uppercase tracking-wide text-gray-400">Your name</p>
          <form action={updateName} className="mt-3 flex items-end gap-3">
            <div className="flex-1">
              <input
                name="name"
                type="text"
                required
                defaultValue={currentName}
                placeholder="Jane Smith"
                className={inputCls}
              />
            </div>
            <button className="bg-[#f7cf4a] px-4 py-2 text-sm font-semibold text-black hover:brightness-95">
              Save
            </button>
          </form>
        </div>

        <div className="bg-white p-5 ring-1 ring-[#ece7d8]">
          <p className="text-xs font-mono uppercase tracking-wide text-gray-400">Email address</p>
          <form action={updateEmail} className="mt-3 flex items-end gap-3">
            <div className="flex-1">
              <input
                name="email"
                type="email"
                required
                defaultValue={user.email ?? ''}
                className={inputCls}
              />
            </div>
            <button className="bg-[#f7cf4a] px-4 py-2 text-sm font-semibold text-black hover:brightness-95">
              Save
            </button>
          </form>
          <p className="mt-2 text-xs text-gray-400">
            You&apos;ll need to confirm this from a link sent to your new address.
          </p>
        </div>

        <div className="bg-white p-5 ring-1 ring-[#ece7d8]">
          <p className="text-xs font-mono uppercase tracking-wide text-gray-400">Password</p>
          <p className="mt-2 text-sm text-gray-500">
            For security, password changes go through a reset link sent to your email.
          </p>
          <form action={sendPasswordReset} className="mt-3">
            <button className="bg-[#f7cf4a] px-4 py-2 text-sm font-semibold text-black hover:brightness-95">
              Send password reset email
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
