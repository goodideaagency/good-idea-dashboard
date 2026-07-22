import { createClient } from '@/lib/supabase/server'
import { listTaskSummariesForAccount, type ClickUpTaskSummary } from '@/lib/clickup'

export type ProjectTask = ClickUpTaskSummary & {
  accountId: string
  accountName: string
}

// Every ClickUp task across every account the caller's agency has connected
// (accounts.clickup_list_id), enriched with which account it belongs to.
// Powers the Dashboard and Projects pages. Scoped to the caller's own agency
// via RLS on the accounts lookup.
export async function listProjectTasksForAgency(): Promise<ProjectTask[]> {
  const supabase = await createClient()
  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, name, clickup_list_id')
    .not('clickup_list_id', 'is', null)

  const connected = accounts ?? []
  const results = await Promise.all(
    connected.map(async (a) => {
      const tasks = await listTaskSummariesForAccount(a.clickup_list_id as string)
      return tasks.map((t) => ({ ...t, accountId: a.id, accountName: a.name }))
    })
  )
  return results.flat()
}
