import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getTask } from '@/lib/clickup'
import { ProjectTasks } from '@/components/project-tasks'
import { postProjectComment } from '../actions'

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ taskId: string }>
}) {
  const { taskId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

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

  return (
    <div className="p-8">
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

      <div className="mx-auto mt-8 max-w-3xl">
        <ProjectTasks tasks={[task]} accountId={account.id} commentAction={postProjectComment} />
      </div>
    </div>
  )
}
