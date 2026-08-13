import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getListFields } from '@/lib/clickup'
import { getServiceByKey } from '@/lib/service-catalog'
import { getAgencyCreditBalance } from '@/lib/credits'
import { ServiceFormFields } from '@/components/service-form-fields'
import { UnsavedFormGuard } from '@/components/unsaved-form-guard'
import { SubmitButton } from '@/components/submit-button'
import { submitServiceRequest } from './actions'

const inputCls =
  'mt-1 w-full border border-[#e7e2d3] px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-900'

export default async function RequestServiceFormPage({
  params,
  searchParams,
}: {
  params: Promise<{ key: string }>
  searchParams: Promise<{ error?: string; account_id?: string }>
}) {
  const { key } = await params
  const { error, account_id: preselectedAccountId } = await searchParams
  const service = getServiceByKey(key)
  if (!service) redirect('/dashboard/request')
  const newClientHref = `/dashboard/clients/new?next=${encodeURIComponent(`/dashboard/request/${key}`)}`

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('agency_users')
    .select('agency_id')
    .eq('user_id', user.id)
    .maybeSingle()

  const [{ data: accounts }, allFields, balance] = await Promise.all([
    supabase.from('accounts').select('id, name, clickup_list_id').eq('archived', false).order('name'),
    getListFields(service.internalListId),
    membership?.agency_id ? getAgencyCreditBalance(membership.agency_id as string) : Promise.resolve(0),
  ])
  const profiles = accounts ?? []
  // Only this service's allow-listed fields -- see service-catalog.ts for why.
  const fields = service.fieldIds
    .map((id) => allFields.find((f) => f.id === id))
    .filter((f) => f !== undefined)
  // Services without dedicated intake questions fall back to a plain
  // description + file upload instead of a blank form.
  const genericIntake = service.fieldIds.length === 0
  const canAfford = balance >= service.baseCreditCost

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold text-gray-900">{service.label}</h1>
        <Link
          href="/dashboard/request"
          className="border border-[#e7e2d3] px-3 py-1.5 text-sm text-gray-700 hover:bg-[#f6f1e4] font-mono uppercase tracking-wide"
        >
          ← Back
        </Link>
      </div>

      <p className="mt-2 text-sm text-gray-500">
        Costs <span className="font-semibold text-gray-900">{service.baseCreditCost} credits</span> — you
        have {balance}.{' '}
        <Link href="/dashboard/credits" className="underline underline-offset-2">
          Manage credits
        </Link>
      </p>

      <div className="mt-6 max-w-xl bg-white p-6 ring-1 ring-[#ece7d8]">
        {error && <p className="mb-4 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {!canAfford && (
          <p className="mb-4 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            You don&apos;t have enough credits for this service yet.{' '}
            <Link href="/dashboard/credits" className="underline underline-offset-2">
              Buy more credits
            </Link>
            .
          </p>
        )}

        {profiles.length === 0 ? (
          <p className="text-sm text-gray-500">
            You don&apos;t have any client profiles yet.{' '}
            <Link href={newClientHref} className="underline underline-offset-2">
              Create one first.
            </Link>
          </p>
        ) : (
          <form
            id="request-form"
            action={submitServiceRequest}
            encType="multipart/form-data"
            className="space-y-4"
          >
            <UnsavedFormGuard formId="request-form" />
            <input type="hidden" name="service_key" value={service.key} />

            <div>
              <label className="block text-sm font-medium text-gray-700" htmlFor="account_id">
                Which client is this for?
              </label>
              <select
                id="account_id"
                name="account_id"
                required
                defaultValue={
                  preselectedAccountId && profiles.some((a) => a.id === preselectedAccountId)
                    ? preselectedAccountId
                    : profiles[0].id
                }
                className={inputCls}
              >
                {profiles.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-400">
                Don&apos;t see them?{' '}
                <Link href={newClientHref} className="underline underline-offset-2">
                  Create a new client profile
                </Link>
                .
              </p>
            </div>

            <ServiceFormFields fields={fields} sections={service.sections} />

            {genericIntake && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700" htmlFor="description">
                    Describe the work
                  </label>
                  <textarea
                    id="description"
                    name="description"
                    rows={4}
                    required
                    className={inputCls}
                    placeholder="What do you need for this request?"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700" htmlFor="attachment">
                    Attach a file <span className="font-normal text-gray-400">(optional)</span>
                  </label>
                  <input id="attachment" name="attachment" type="file" className="mt-1 text-sm text-gray-700" />
                </div>
              </>
            )}

            <SubmitButton
              disabled={!canAfford}
              pendingText="Submitting…"
              className="bg-[#f7cf4a] px-4 py-2 text-sm font-semibold text-black hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Start This Service
            </SubmitButton>
          </form>
        )}
      </div>
    </div>
  )
}
