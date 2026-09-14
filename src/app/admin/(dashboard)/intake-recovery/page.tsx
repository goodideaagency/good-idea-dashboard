import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAdmin } from '@/lib/admin-auth'
import type { ReadableAnswer } from '@/lib/intake-submissions'
import { dismissIntakeSubmission } from './actions'

const KIND_LABEL: Record<string, string> = {
  managed_service_intake: 'Managed service intake',
  service_request: 'Service request',
  project_comment: 'Project comment',
}

// Every submission captured by lib/intake-submissions.ts BEFORE its ClickUp
// write, that never made it all the way to `status = 'synced'` -- an
// expired session, a rejected business rule, or a ClickUp failure. Nothing
// here is actually lost anymore; this is just the manual-follow-up queue.
export default async function IntakeRecoveryPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/admin/login')
  if (!(await isAdmin(user.email))) redirect('/dashboard')

  const admin = createAdminClient()
  const { data: rows } = await admin
    .from('intake_submissions')
    .select('id, created_at, kind, raw_data, agencies(name), accounts(name)')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  return (
    <div>
      <h1 className="text-3xl font-semibold text-gray-900">Intake recovery</h1>
      <p className="mt-1 text-sm text-gray-500">
        Submissions that never made it into ClickUp. Follow up manually (re-enter into ClickUp,
        or reach out to the client), then dismiss.
      </p>

      {(rows ?? []).length === 0 ? (
        <div className="mt-6 border border-dashed border-[#e7e2d3] bg-white p-8 text-center">
          <p className="text-sm text-gray-500">Nothing pending.</p>
        </div>
      ) : (
        <div className="mt-6 max-w-3xl space-y-4">
          {(rows ?? []).map((r) => {
            const raw = r.raw_data as { readable?: ReadableAnswer[] } | null
            const agencyName = (r.agencies as { name?: string } | null)?.name ?? '—'
            const accountName = (r.accounts as { name?: string } | null)?.name ?? '—'
            return (
              <div key={r.id} className="bg-white p-5 ring-1 ring-[#ece7d8]">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">
                      {KIND_LABEL[r.kind] ?? r.kind} — {agencyName} / {accountName}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {new Date(r.created_at).toLocaleString()}
                    </p>
                  </div>
                  <form action={dismissIntakeSubmission}>
                    <input type="hidden" name="id" value={r.id} />
                    <button className="text-xs font-mono uppercase tracking-wide text-gray-500 hover:text-gray-800">
                      Dismiss
                    </button>
                  </form>
                </div>
                <dl className="mt-4 space-y-2 border-t border-[#f2ede0] pt-4">
                  {(raw?.readable ?? []).map((qa, i) => (
                    <div key={i}>
                      <dt className="text-xs font-medium text-gray-500">{qa.question}</dt>
                      <dd className="whitespace-pre-wrap text-sm text-gray-900">
                        {qa.answer || '—'}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
