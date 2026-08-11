'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  getListFields,
  createTask,
  createTaskFromTemplate,
  setTaskCustomField,
  updateTaskMarkdownDescription,
  linkTasks,
  uploadTaskAttachment,
} from '@/lib/clickup'
import { getServiceByKey, CREDIT_COST_FIELD_ID } from '@/lib/service-catalog'
import { formatIntakeSummary } from '@/lib/intake-summary'
import { spendAgencyCredits } from '@/lib/credits'

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

  const { data: membership } = await supabase
    .from('agency_users')
    .select('agency_id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!membership) redirect('/dashboard/request')
  const agencyId = membership.agency_id as string

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

  // Claims the credits up front, atomically -- fails clean with no ClickUp
  // task created if the agency doesn't actually have enough (e.g. a second
  // tab racing this one).
  const spent = await spendAgencyCredits(agencyId, service.baseCreditCost, 'service_request', {
    accountId,
    note: service.label,
  })
  if (!spent) {
    redirect(
      `/dashboard/request/${serviceKey}?error=` +
        encodeURIComponent("You don't have enough credits for this service.")
    )
  }
  // The sidebar balance lives in the shared dashboard layout -- revalidate it
  // now instead of waiting for its normal cache window to expire.
  revalidatePath('/dashboard', 'layout')

  // Re-fetch the field schema server-side -- never trust field types/ids from
  // the client. Restricted to this service's allow-listed fields (see
  // service-catalog.ts) since ClickUp doesn't cleanly scope fields to one List.
  const allFields = await getListFields(service.internalListId)
  const fields = allFields.filter((f) => service.fieldIds.includes(f.id))
  const customFields = fields
    .map((f) => ({ id: f.id, value: parseFieldValue(f.type, formData.get(`field_${f.id}`)) }))
    .filter((f) => f.value !== undefined)
  customFields.push({ id: CREDIT_COST_FIELD_ID, value: service.baseCreditCost })

  // Services with no dedicated intake questions (see service-catalog.ts)
  // fall back to a free-text description instead of a blank summary.
  const genericDescription = String(formData.get('description') || '').trim()
  const summary =
    fields.length > 0
      ? formatIntakeSummary(fields, service.sections, customFields)
      : genericDescription || '_No description provided._'

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

  const attachment = formData.get('attachment')
  if (internalTask && attachment instanceof File && attachment.size > 0) {
    await uploadTaskAttachment(internalTask.id, attachment, attachment.name)
  }

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

    // So the Internal Ops ClickUp webhook can trace a later "Credit Cost"
    // field edit on this task back to the agency/account to charge or
    // refund (see reconcileTaskCost).
    const admin = createAdminClient()
    await admin.from('service_requests').insert({
      agency_id: agencyId,
      account_id: accountId,
      clickup_task_id: internalTask.id,
      clickup_client_task_id: clientTask.id,
      service_key: service.key,
      base_credit_cost: service.baseCreditCost,
    })
  }

  redirect(`/dashboard/projects/${clientTask.id}`)
}
