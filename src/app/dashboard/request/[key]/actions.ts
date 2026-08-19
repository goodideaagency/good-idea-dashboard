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
  deleteTask,
} from '@/lib/clickup'
import { getServiceByKey, CREDIT_COST_FIELD_ID, buildInternalTaskName } from '@/lib/service-catalog'
import { formatIntakeSummary } from '@/lib/intake-summary'
import { getAgencyCreditBalance, spendAgencyCredits, grantAgencyCredits } from '@/lib/credits'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseFieldValue(formData: FormData, fieldId: string, type: string): any {
  // "labels" is multi-select -- every checked option shares one field name,
  // so it's collected as a list instead of a single value.
  if (type === 'labels') {
    const values = formData.getAll(`field_${fieldId}`).map(String)
    return values.length > 0 ? values : undefined
  }
  const raw = formData.get(`field_${fieldId}`)
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
    .select('agency_id, agencies(name)')
    .eq('user_id', user.id)
    .maybeSingle<{ agency_id: string; agencies: { name: string } | null }>()
  if (!membership) redirect('/dashboard/request')
  const agencyId = membership.agency_id
  const agencyName = membership.agencies?.name ?? ''

  // RLS ensures this only returns the account if it belongs to the caller's agency.
  const { data: account } = await supabase
    .from('accounts')
    .select('id, name, clickup_list_id, clickup_profile_task_id')
    .eq('id', accountId)
    .maybeSingle<{
      id: string
      name: string
      clickup_list_id: string | null
      clickup_profile_task_id: string | null
    }>()
  if (!account?.clickup_list_id) {
    redirect(
      `/dashboard/request/${serviceKey}?error=` +
        encodeURIComponent('That account is not connected to a project yet.')
    )
  }

  // Cheap up-front check so an agency with an obviously insufficient balance
  // never gets a ClickUp task created for a request that's about to fail.
  // The atomic spend below (after the task exists, so it can be tagged with
  // the task id -- see reconcileTaskCost) is still the real gate.
  const balance = await getAgencyCreditBalance(agencyId)
  if (balance < service.baseCreditCost) {
    redirect(
      `/dashboard/request/${serviceKey}?error=` +
        encodeURIComponent("You don't have enough credits for this service.")
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
    .map((f) => ({ id: f.id, value: parseFieldValue(formData, f.id, f.type) }))
    .filter((f) => f.value !== undefined)
  customFields.push({ id: CREDIT_COST_FIELD_ID, value: service.baseCreditCost })

  // Services with no dedicated intake questions (see service-catalog.ts)
  // fall back to a free-text description instead of a blank summary.
  const genericDescription = String(formData.get('description') || '').trim()
  const summary =
    fields.length > 0
      ? formatIntakeSummary(fields, service.sections, customFields)
      : genericDescription || '_No description provided._'

  const internalTaskName = buildInternalTaskName(service.label, agencyName, account.name)
  const internalTask = service.templateId
    ? await createTaskFromTemplate(service.internalListId, service.templateId, internalTaskName)
    : await createTask(service.internalListId, internalTaskName, {
        customFields,
        markdownDescription: summary,
      })

  // Stop here, before any credits move, if ClickUp couldn't even create the
  // internal tracking task -- otherwise (confirmed via code review) a
  // transient ClickUp failure would silently fall through to charging
  // credits and creating the client-facing task anyway, leaving your team
  // with zero record of the request anywhere while the agency gets billed.
  if (!internalTask) {
    redirect(
      `/dashboard/request/${serviceKey}?error=` +
        encodeURIComponent('Could not submit your request. Please try again.')
    )
  }

  // Template-based creation ignores custom_fields/description in the create
  // call, so set each afterward.
  if (service.templateId) {
    for (const cf of customFields) {
      await setTaskCustomField(internalTask.id, cf.id, cf.value)
    }
    await updateTaskMarkdownDescription(internalTask.id, summary)
  }

  const attachment = formData.get('attachment')
  if (attachment instanceof File && attachment.size > 0) {
    await uploadTaskAttachment(internalTask.id, attachment, attachment.name)
  }

  // Claims the credits now that the internal task exists, tagged with its id
  // -- this is what lets a later "Credit Cost" field edit be reconciled as
  // just the difference from this base charge, instead of the whole new
  // total (see reconcileTaskCost/getAlreadyChargedForTask in lib/credits.ts).
  // Atomic, so it's still the real gate against a race with another tab.
  const spent = await spendAgencyCredits(agencyId, service.baseCreditCost, 'service_request', {
    accountId,
    clickupTaskId: internalTask.id,
    note: service.label,
  })
  if (!spent) {
    // A genuine race with the up-front balance check above (another
    // request spent the balance in between) -- the internal task now
    // exists for a request that was never actually paid for, so clean it
    // up rather than leaving your team a stray, uncharged task.
    await deleteTask(internalTask.id)
    redirect(
      `/dashboard/request/${serviceKey}?error=` +
        encodeURIComponent("You don't have enough credits for this service.")
    )
  }
  // The sidebar balance lives in the shared dashboard layout -- revalidate it
  // now instead of waiting for its normal cache window to expire.
  revalidatePath('/dashboard', 'layout')

  const clientTask = await createTask(account.clickup_list_id, service.label, {
    status: 'scoping',
  })

  if (!clientTask) {
    // Credits were already spent and the internal task already exists --
    // refund rather than leaving the agency charged for a request with no
    // client-facing task. The internal task is left in place (not deleted)
    // so your team can still see something was attempted and follow up.
    await grantAgencyCredits(agencyId, service.baseCreditCost, 'manual', {
      clickupTaskId: internalTask.id,
      note: `Refund: ${service.label} request failed after the client task couldn't be created`,
    })
    revalidatePath('/dashboard', 'layout')
    redirect(
      `/dashboard/request/${serviceKey}?error=` +
        encodeURIComponent('Could not submit your request. Please try again.')
    )
  }

  await linkTasks(clientTask.id, internalTask.id)
  // So the team can jump straight to this client's contact info/files from
  // the internal task instead of searching for the right Client Profile.
  if (account.clickup_profile_task_id) {
    await linkTasks(internalTask.id, account.clickup_profile_task_id)
  }

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

  redirect(`/dashboard/projects/${clientTask.id}`)
}
