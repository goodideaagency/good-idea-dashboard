import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { setAccountArchived } from './actions'

type AccountRow = {
  id: string
  name: string
  website: string | null
  logo_url: string | null
  archived: boolean
}

export default async function ClientsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, name, website, logo_url, archived')
    .order('created_at', { ascending: true })
    .returns<AccountRow[]>()

  const accountList = (accounts ?? []).filter((a) => !a.archived)
  const archivedList = (accounts ?? []).filter((a) => a.archived)

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <h1 className="text-4xl font-semibold text-gray-900">My Clients</h1>
        <div className="text-right">
          <p className="text-xs font-mono uppercase tracking-wide text-gray-400">
            Total clients
          </p>
          <p className="text-3xl font-semibold text-gray-900">{accountList.length}</p>
        </div>
      </div>

      <div className="mt-10 flex items-baseline justify-between">
        <p className="text-xs font-mono uppercase tracking-wide text-gray-400">
          Client profiles
        </p>
        <Link
          href="/dashboard/clients/new"
          className="border border-[#e7e2d3] px-3 py-1.5 text-xs text-gray-700 hover:bg-[#f6f1e4] font-mono uppercase tracking-wide"
        >
          + New client profile
        </Link>
      </div>

      {accountList.length === 0 ? (
        <div className="mt-4 border border-dashed border-[#e7e2d3] bg-white p-8 text-center">
          <p className="text-sm text-gray-500">
            No client profiles yet.{' '}
            <Link href="/dashboard/clients/new" className="underline underline-offset-2">
              Add your first one.
            </Link>
          </p>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {accountList.map((a) => (
            <Link
              key={a.id}
              href={`/dashboard/clients/${a.id}`}
              className="flex flex-col justify-between bg-[#F5EFE2] p-6 ring-1 ring-[#ece7d8] hover:bg-[#f0ead9]"
            >
              <div className="flex items-center gap-3">
                {a.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={a.logo_url}
                    alt=""
                    className="h-10 w-10 shrink-0 rounded-full object-cover ring-1 ring-[#ece7d8]"
                  />
                ) : (
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center bg-[#ece7d8] text-sm font-semibold text-gray-700">
                    {a.name.trim().charAt(0).toUpperCase() || '?'}
                  </span>
                )}
                <div className="min-w-0">
                  <p className="truncate text-lg font-semibold text-gray-900">{a.name}</p>
                  {a.website && (
                    <p className="truncate text-sm text-gray-600">{a.website}</p>
                  )}
                </div>
              </div>
              <div className="mt-6 flex items-center justify-end gap-2 text-sm font-semibold text-gray-900">
                View profile <span aria-hidden="true">→</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {archivedList.length > 0 && (
        <details className="mt-10">
          <summary className="cursor-pointer text-xs font-mono uppercase tracking-wide text-gray-400">
            Archived clients ({archivedList.length})
          </summary>
          <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {archivedList.map((a) => (
              <div
                key={a.id}
                className="flex flex-col justify-between bg-white p-6 ring-1 ring-[#ece7d8]"
              >
                <div className="flex items-center gap-3">
                  {a.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={a.logo_url}
                      alt=""
                      className="h-10 w-10 shrink-0 rounded-full object-cover opacity-60 ring-1 ring-[#ece7d8]"
                    />
                  ) : (
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center bg-[#ece7d8] text-sm font-semibold text-gray-500">
                      {a.name.trim().charAt(0).toUpperCase() || '?'}
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-lg font-semibold text-gray-500">{a.name}</p>
                    {a.website && (
                      <p className="truncate text-sm text-gray-400">{a.website}</p>
                    )}
                  </div>
                </div>
                <form action={setAccountArchived} className="mt-6">
                  <input type="hidden" name="account_id" value={a.id} />
                  <input type="hidden" name="archived" value="false" />
                  <button className="w-full border border-[#e7e2d3] px-3 py-1.5 text-xs text-gray-700 hover:bg-[#f6f1e4] font-mono uppercase tracking-wide">
                    Restore
                  </button>
                </form>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}
