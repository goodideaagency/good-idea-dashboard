import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ClickUpStatusPill } from '@/components/clickup-status-pill'
import { LogoUploader } from '@/components/logo-uploader'
import { AccountFiles } from '@/components/account-files'
import { SubmitButton } from '@/components/submit-button'
import { getTask, listTaskSummariesForAccount } from '@/lib/clickup'
import { updateClientProfile, setAccountArchived } from '../actions'

const inputCls =
  'mt-1 w-full border border-[#e7e2d3] px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-900'

type AccountRow = {
  id: string
  name: string
  website: string | null
  logo_url: string | null
  clickup_list_id: string | null
  clickup_profile_task_id: string | null
  archived: boolean
}

export default async function ClientProfilePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Row-level security ensures this only returns an account in the user's agency.
  const { data: account } = await supabase
    .from('accounts')
    .select('id, name, website, logo_url, clickup_list_id, clickup_profile_task_id, archived')
    .eq('id', id)
    .maybeSingle<AccountRow>()

  if (!account) redirect('/dashboard/clients')

  // Files live as attachments on the Client Profile task in ClickUp -- read
  // straight from there rather than a local copy. Both ClickUp calls now
  // throw on a real failure instead of quietly returning empty (see
  // clickup.ts) -- caught here so a transient hiccup doesn't take down the
  // whole client profile page, but tracked so the Projects section can say
  // so instead of looking identical to "this client has no projects."
  let projectsFailed = false
  const [projectTasks, profileTask] = await Promise.all([
    account.clickup_list_id
      ? listTaskSummariesForAccount(account.clickup_list_id).catch(() => {
          projectsFailed = true
          return []
        })
      : [],
    account.clickup_profile_task_id ? getTask(account.clickup_profile_task_id).catch(() => null) : null,
  ])
  const files = profileTask?.attachments ?? []

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-semibold text-gray-900">{account.name}</h1>
            {account.archived && (
              <span className="border border-[#e7e2d3] px-2 py-0.5 text-xs font-mono uppercase tracking-wide text-gray-500">
                Archived
              </span>
            )}
          </div>
          {account.website && <p className="mt-1 text-sm text-gray-500">{account.website}</p>}
        </div>
        <div className="flex items-center gap-2">
          <form action={setAccountArchived}>
            <input type="hidden" name="account_id" value={account.id} />
            <input type="hidden" name="archived" value={account.archived ? 'false' : 'true'} />
            <SubmitButton
              pendingText="Working…"
              className="border border-[#e7e2d3] px-3 py-1.5 text-sm text-gray-700 hover:bg-[#f6f1e4] font-mono uppercase tracking-wide disabled:cursor-not-allowed disabled:opacity-60"
            >
              {account.archived ? 'Restore client' : 'Archive client'}
            </SubmitButton>
          </form>
          <Link
            href="/dashboard/clients"
            className="text-sm text-gray-700 hover:text-gray-900 font-mono uppercase tracking-wide"
          >
            Back
          </Link>
        </div>
      </div>

      <div className="mx-auto mt-8 max-w-3xl">
        <p className="text-xs font-mono uppercase tracking-wide text-gray-400">Client profile</p>
        <div className="mt-4 bg-white p-5 ring-1 ring-[#ece7d8]">
          <LogoUploader accountId={account.id} currentUrl={account.logo_url} />

          <form action={updateClientProfile} className="mt-6 grid gap-4 sm:grid-cols-2">
            <input type="hidden" name="account_id" value={account.id} />
            <div>
              <label className="block text-sm font-medium text-gray-700" htmlFor="name">
                Client company name
              </label>
              <input
                id="name"
                name="name"
                type="text"
                required
                defaultValue={account.name}
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700" htmlFor="website">
                Website
              </label>
              <input
                id="website"
                name="website"
                type="text"
                defaultValue={account.website ?? ''}
                className={inputCls}
              />
            </div>
            <div className="sm:col-span-2">
              <SubmitButton
                pendingText="Saving…"
                className="bg-[#f7cf4a] px-4 py-2 text-sm font-semibold text-black hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Save profile
              </SubmitButton>
            </div>
          </form>
        </div>

        <p className="mt-10 text-xs font-mono uppercase tracking-wide text-gray-400">Files</p>
        <div className="mt-4">
          <AccountFiles
            accountId={account.id}
            initialFiles={files}
            canUpload={Boolean(account.clickup_profile_task_id)}
          />
        </div>

        <p className="mt-10 text-xs font-mono uppercase tracking-wide text-gray-400">
          Projects{projectTasks.length > 0 ? ` (${projectTasks.length})` : ''}
        </p>
        {projectsFailed ? (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            Couldn&apos;t load projects right now — try refreshing.
          </p>
        ) : projectTasks.length === 0 ? (
          <p className="mt-4 text-sm text-gray-500">No projects yet for this client.</p>
        ) : (
          <div className="mt-4 space-y-3">
            {projectTasks.map((t) => (
              <Link
                key={t.id}
                href={`/dashboard/projects/${t.id}`}
                className="flex items-center justify-between bg-white p-4 ring-1 ring-[#ece7d8] hover:bg-gray-50"
              >
                <span className="text-sm font-medium text-gray-900">{t.name}</span>
                <span className="flex items-center gap-3">
                  <ClickUpStatusPill status={t.status} color={t.statusColor} />
                  <span className="text-gray-300">›</span>
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
