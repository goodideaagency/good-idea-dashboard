import { createList, createTask, CLIENT_PROFILES_STATUSES } from './clickup'
import type { createAdminClient } from './supabase/admin'

// Provisions everything a brand-new client account needs in ClickUp beyond
// its own row: its own List for project work, plus (agency-wide, created
// once) the shared Client Profiles List and a Client Profile reference task
// inside it. Three separate flows create a client account (the standalone
// "create client profile" form, adding a managed service for a brand-new
// client, and the first client right after a fresh agency signs up) --
// this used to live duplicated in the first of those only, so the other two
// silently never got a Client Profiles list/task at all. Pulled out here so
// a fix (like createList's status-override one) can't drift out of sync
// between them again.
export async function provisionClientProfile(
  admin: ReturnType<typeof createAdminClient>,
  agency: { id: string; clickup_folder_id: string | null; clickup_profiles_list_id: string | null },
  account: { id: string; name: string },
  website?: string | null
): Promise<void> {
  if (!agency.clickup_folder_id) return

  const list = await createList(agency.clickup_folder_id, account.name)
  if (list) {
    await admin.from('accounts').update({ clickup_list_id: list.id }).eq('id', account.id)
  }

  let profilesListId = agency.clickup_profiles_list_id
  if (!profilesListId) {
    // Brand new, empty list -- safe to set the status override right at
    // creation (see the warning on createList about applying it to a list
    // that already has tasks).
    const profilesList = await createList(agency.clickup_folder_id, 'Client Profiles', CLIENT_PROFILES_STATUSES)
    if (profilesList) {
      profilesListId = profilesList.id
      await admin.from('agencies').update({ clickup_profiles_list_id: profilesList.id }).eq('id', agency.id)
    }
  }

  if (profilesListId) {
    const details = website ? `Website: ${website}` : undefined
    const profileTask = await createTask(profilesListId, `Client Profile — ${account.name}`, {
      status: 'client profile',
      description: details,
    })
    if (profileTask) {
      await admin.from('accounts').update({ clickup_profile_task_id: profileTask.id }).eq('id', account.id)
    }
  }
}
