import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getListFields } from '@/lib/clickup'
import { getManagedServiceByPriceId } from '@/lib/service-catalog'
import { getFormDraft } from '@/lib/form-drafts'
import { ServiceFormFields } from '@/components/service-form-fields'
import { UnsavedFormGuard } from '@/components/unsaved-form-guard'
import { DraftAutosave } from '@/components/draft-autosave'
import { DraftRestoredBanner } from '@/components/draft-restored-banner'
import { SubmitButton } from '@/components/submit-button'
import { submitManagedServiceIntake } from './actions'

// Lands here right after a successful Stripe Checkout for a managed/recurring
// service -- the in-platform intake form, same Custom-Field-driven pattern as
// one-time services, except the account is already fixed (payment already
// happened for it) so there's no client picker here.
export default async function ManagedServiceOnboardingPage({
  params,
  searchParams,
}: {
  params: Promise<{ priceId: string }>
  searchParams: Promise<{ account_id?: string; error?: string }>
}) {
  const { priceId } = await params
  const { account_id, error } = await searchParams
  const service = getManagedServiceByPriceId(priceId)
  if (!service || !account_id) redirect('/dashboard')

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // RLS ensures this only returns the account if it belongs to the caller's agency.
  const { data: account } = await supabase
    .from('accounts')
    .select('id, name')
    .eq('id', account_id)
    .maybeSingle<{ id: string; name: string }>()
  if (!account) redirect('/dashboard')

  const draftContext = { price_id: priceId }
  const [allFields, draft] = await Promise.all([
    getListFields(service.internalListId),
    getFormDraft({ userId: user.id, kind: 'managed_service_intake', context: draftContext }),
  ])
  const fields = service.fieldIds
    .map((id) => allFields.find((f) => f.id === id))
    .filter((f) => f !== undefined)

  return (
    <div>
      <h1 className="text-3xl font-semibold text-gray-900">Set up {service.label}</h1>
      <p className="mt-1 text-sm text-gray-500">
        Payment received for <span className="font-medium text-gray-700">{account.name}</span> --
        a few quick questions to get this started.
      </p>

      <div className="mt-6 max-w-xl bg-white p-6 ring-1 ring-[#ece7d8]">
        {error && <p className="mb-4 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {draft && (
          <DraftRestoredBanner
            kind="managed_service_intake"
            context={draftContext}
            updatedAt={draft.updatedAt}
          />
        )}

        <form id="onboarding-form" action={submitManagedServiceIntake} className="space-y-4">
          {fields.length > 0 && <UnsavedFormGuard formId="onboarding-form" />}
          <input type="hidden" name="price_id" value={priceId} />
          <input type="hidden" name="account_id" value={account.id} />

          {fields.length === 0 ? (
            <p className="text-sm text-gray-500">
              No setup questions yet for this service -- we&apos;ll follow up shortly to get
              started.
            </p>
          ) : (
            <ServiceFormFields fields={fields} sections={service.sections} defaultValues={draft?.formEntries} />
          )}

          {fields.length > 0 && (
            <DraftAutosave formId="onboarding-form" kind="managed_service_intake" context={draftContext} />
          )}

          <SubmitButton
            pendingText="Finishing…"
            className="bg-[#f7cf4a] px-4 py-2 text-sm font-semibold text-black hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Finish setup
          </SubmitButton>
        </form>
      </div>
    </div>
  )
}
