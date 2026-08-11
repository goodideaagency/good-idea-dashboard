'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import {
  createTask,
  createTaskFromTemplate,
  getListFields,
  linkTasks,
  setTaskCustomField,
  updateTaskMarkdownDescription,
} from '@/lib/clickup'
import { getManagedServiceByPriceId } from '@/lib/service-catalog'
import { formatIntakeSummary } from '@/lib/intake-summary'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseFieldValue(type: string, raw: FormDataEntryValue | null): any {
  if (type === 'checkbox') return raw === 'on'
  if (raw === null || raw === '') return undefined
  if (type === 'number') return Number(raw)
  if (type === 'date') return new Date(String(raw)).getTime()
  return String(raw)
}

// Completes setup for a just-purchased managed service: creates the
// client-facing task (status "ongoing", matching the existing Ongoing
// Services card convention) and the paired internal task (intake answers as
// Custom Fields, in the service's Recurring Services List), then links them
// -- same linked-pair pattern as one-time service requests.
export async function submitManagedServiceIntake(formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const priceId = String(formData.get('price_id') || '').trim()
  const accountId = String(formData.get('account_id') || '').trim()
  const service = getManagedServiceByPriceId(priceId)
  if (!service || !accountId) redirect('/dashboard')

  // RLS ensures this only returns the account if it belongs to the caller's agency.
  const { data: account } = await supabase
    .from('accounts')
    .select('id, name, clickup_list_id')
    .eq('id', accountId)
    .maybeSingle<{ id: string; name: string; clickup_list_id: string | null }>()
  if (!account?.clickup_list_id) {
    redirect(
      `/dashboard/onboarding/${priceId}?account_id=${accountId}&error=` +
        encodeURIComponent('That account is not connected to a project yet.')
    )
  }

  // Re-fetch the field schema server-side -- never trust field types/ids from
  // the client. Restricted to this service's allow-listed fields (see
  // service-catalog.ts) since ClickUp doesn't cleanly scope fields to one List.
  const allFields = await getListFields(service.internalListId)
  const fields = allFields.filter((f) => service.fieldIds.includes(f.id))
  // Attachment-type custom fields render as a file input (see
  // ServiceFormFields) but aren't wired up to ClickUp's attachment API here --
  // no service currently lists one, so this just guards against a future
  // File object being sent as a plain field value.
  const customFields = fields
    .filter((f) => f.type !== 'attachment')
    .map((f) => ({ id: f.id, value: parseFieldValue(f.type, formData.get(`field_${f.id}`)) }))
    .filter((f) => f.value !== undefined)

  // A readable, grouped writeup of the answers -- this becomes the task's
  // description so the team sees a clean summary up top instead of having to
  // piece it together from ClickUp's cramped, truncated Custom Fields sidebar.
  const summary = formatIntakeSummary(fields, service.sections, customFields)

  const internalTaskName = `${service.label} — ${account.name}`
  const internalTask = service.templateId
    ? await createTaskFromTemplate(service.internalListId, service.templateId, internalTaskName)
    : await createTask(service.internalListId, internalTaskName, {
        customFields,
        markdownDescription: summary,
      })

  // Template-based creation ignores custom_fields/description in the create
  // call, so set each afterward.
  if (service.templateId && internalTask) {
    for (const cf of customFields) {
      await setTaskCustomField(internalTask.id, cf.id, cf.value)
    }
    await updateTaskMarkdownDescription(internalTask.id, summary)
  }

  const clientTask = await createTask(account.clickup_list_id, service.clientTaskName, {
    status: 'ongoing',
  })

  if (!clientTask) {
    redirect(
      `/dashboard/onboarding/${priceId}?account_id=${accountId}&error=` +
        encodeURIComponent('Could not finish setup. Please try again.')
    )
  }

  if (internalTask) {
    await linkTasks(clientTask.id, internalTask.id)
  }

  redirect(`/dashboard/projects/${clientTask.id}`)
}
