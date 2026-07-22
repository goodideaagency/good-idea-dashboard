'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getListFields, createTask, linkTasks } from '@/lib/clickup'
import { getServiceByKey } from '@/lib/service-catalog'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseFieldValue(type: string, raw: FormDataEntryValue | null): any {
  if (type === 'checkbox') return raw === 'on'
  if (raw === null || raw === '') return undefined
  if (type === 'number') return Number(raw)
  if (type === 'date') return new Date(String(raw)).getTime()
  return String(raw)
}

// Handles a service request: creates the client-facing task (what the agency
// sees) and the paired internal task (with the intake answers as Custom
// Fields, in the service's Internal Ops List), then links them together.
export async function submitServiceRequest(formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const serviceKey = String(formData.get('service_key') || '').trim()
  const accountId = String(formData.get('account_id') || '').trim()
  const service = getServiceByKey(serviceKey)
  if (!service || !accountId) redirect('/dashboard/request')

  // RLS ensures this only returns the account if it belongs to the caller's agency.
  const { data: account } = await supabase
    .from('accounts')
    .select('id, name, clickup_list_id')
    .eq('id', accountId)
    .maybeSingle<{ id: string; name: string; clickup_list_id: string | null }>()
  if (!account?.clickup_list_id) {
    redirect(
      `/dashboard/request/${serviceKey}?error=` +
        encodeURIComponent('That account is not connected to a project yet.')
    )
  }

  // Re-fetch the field schema server-side -- never trust field types/ids from the client.
  const fields = await getListFields(service.internalListId)
  const customFields = fields
    .map((f) => ({ id: f.id, value: parseFieldValue(f.type, formData.get(`field_${f.id}`)) }))
    .filter((f) => f.value !== undefined)

  const internalTask = await createTask(service.internalListId, `${service.label} — ${account.name}`, {
    customFields,
  })

  const clientTask = await createTask(account.clickup_list_id, service.label, {
    status: 'scoping',
  })

  if (!clientTask) {
    redirect(
      `/dashboard/request/${serviceKey}?error=` +
        encodeURIComponent('Could not submit your request. Please try again.')
    )
  }

  if (internalTask) {
    await linkTasks(clientTask.id, internalTask.id)
  }

  redirect(`/dashboard/projects/${clientTask.id}`)
}
