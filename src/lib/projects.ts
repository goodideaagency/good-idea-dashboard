import { createClient } from '@/lib/supabase/server'
import { listTaskSummariesForAccount, type ClickUpTaskSummary } from '@/lib/clickup'

export type ProjectTask = ClickUpTaskSummary & {
  accountId: string
  accountName: string
}

export type ProjectTasksResult = { tasks: ProjectTask[]; failedAccountNames: string[] }

// Every ClickUp task across every account the caller's agency has connected
// (accounts.clickup_list_id), enriched with which account it belongs to.
// Powers the Dashboard and Projects pages. Scoped to the caller's own agency
// via RLS on the accounts lookup.
//
// One account's ClickUp List failing to load no longer blanks out every
// other account's real tasks -- each is caught independently, and which
// ones failed is reported back so the page can say so, instead of that
// failure looking identical to "this client genuinely has no projects."
export async function listProjectTasksForAgency(): Promise<ProjectTasksResult> {
  const supabase = await createClient()
  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, name, clickup_list_id')
    .not('clickup_list_id', 'is', null)

  const connected = accounts ?? []
  const failedAccountNames: string[] = []
  const results = await Promise.all(
    connected.map(async (a) => {
      try {
        const tasks = await listTaskSummariesForAccount(a.clickup_list_id as string)
        return tasks.map((t) => ({ ...t, accountId: a.id, accountName: a.name }))
      } catch {
        failedAccountNames.push(a.name as string)
        return []
      }
    })
  )
  return { tasks: results.flat(), failedAccountNames }
}
