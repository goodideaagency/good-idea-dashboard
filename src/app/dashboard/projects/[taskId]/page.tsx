import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getTask } from '@/lib/clickup'
import { getAlreadyChargedForTask } from '@/lib/credits'
import { ProjectTasks } from '@/components/project-tasks'
import { postProjectComment } from '../actions'

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ taskId: string }>
  searchParams: Promise<{ error?: string }>
}) {
  const { taskId } = await params
  const { error } = await searchParams
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // null here means the task genuinely doesn't exist (a stale/bad link) --
  // any other ClickUp failure now throws instead (see getTask), so it isn't
  // mistaken for the same thing. Let that propagate to Next's error
  // boundary rather than silently bouncing back to /dashboard/projects with
  // no explanation, which is what used to happen for BOTH cases alike.
  const task = await getTask(taskId)
  if (!task) redirect('/dashboard/projects')

  // Ownership: this only matches if the task's List belongs to an account in
  // the caller's own agency (RLS-scoped).
  const { data: account } = await supabase
    .from('accounts')
    .select('id, name')
    .eq('clickup_list_id', task.listId)
    .maybeSingle<{ id: string; name: string }>()
  if (!account) redirect('/dashboard/projects')

  // Credit cost only applies to tasks opened via a credit-funded service
  // request -- the "Credit Cost" field itself lives on the internal task,
  // never the client-facing one the customer is looking at here, so this
  // has to go through service_requests to find that internal task id.
  const admin = createAdminClient()
  const { data: serviceRequest } = await admin
    .from('service_requests')
    .select('clickup_task_id')
    .eq('clickup_client_task_id', taskId)
    .maybeSingle<{ clickup_task_id: string }>()
  const creditCosts = serviceRequest
    ? { [task.id]: await getAlreadyChargedForTask(serviceRequest.clickup_task_id) }
    : undefined

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-gray-900">{task.name}</h1>
          <p className="mt-1 text-sm text-gray-500">{account.name}</p>
        </div>
        <Link
          href="/dashboard/projects"
          className="border border-[#e7e2d3] px-3 py-1.5 text-sm text-gray-700 hover:bg-[#f6f1e4] font-mono uppercase tracking-wide"
        >
          ← Back to projects
        </Link>
      </div>

      {error && (
        <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <div className="mt-8">
        <ProjectTasks
          tasks={[task]}
          accountId={account.id}
          commentAction={postProjectComment}
          creditCosts={creditCosts}
        />
      </div>
    </div>
  )
}
