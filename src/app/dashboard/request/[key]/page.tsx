import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getListFields } from '@/lib/clickup'
import { getServiceByKey } from '@/lib/service-catalog'
import { submitServiceRequest } from './actions'

const inputCls =
  'mt-1 w-full border border-[#e7e2d3] px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-900'

export default async function RequestServiceFormPage({
  params,
  searchParams,
}: {
  params: Promise<{ key: string }>
  searchParams: Promise<{ error?: string }>
}) {
  const { key } = await params
  const { error } = await searchParams
  const service = getServiceByKey(key)
  if (!service) redirect('/dashboard/request')

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: accounts }, allFields] = await Promise.all([
    supabase.from('accounts').select('id, name, clickup_list_id').order('name'),
    getListFields(service.internalListId),
  ])
  const profiles = accounts ?? []
  // Only this service's allow-listed fields -- see service-catalog.ts for why.
  const fields = service.fieldIds
    .map((id) => allFields.find((f) => f.id === id))
    .filter((f) => f !== undefined)

  return (
    <div className="p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold text-gray-900">{service.label}</h1>
        <Link
          href="/dashboard/request"
          className="border border-[#e7e2d3] px-3 py-1.5 text-sm text-gray-700 hover:bg-[#f6f1e4] font-mono uppercase tracking-wide"
        >
          ← Back
        </Link>
      </div>

      <div className="mt-6 max-w-xl bg-white p-6 ring-1 ring-[#ece7d8]">
        {error && <p className="mb-4 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        {profiles.length === 0 ? (
          <p className="text-sm text-gray-500">
            You don&apos;t have any client profiles yet.{' '}
            <Link href="/dashboard/clients/new" className="underline underline-offset-2">
              Create one first.
            </Link>
          </p>
        ) : (
          <form action={submitServiceRequest} className="space-y-4">
            <input type="hidden" name="service_key" value={service.key} />

            <div>
              <label className="block text-sm font-medium text-gray-700" htmlFor="account_id">
                Which client is this for?
              </label>
              <select
                id="account_id"
                name="account_id"
                required
                defaultValue={profiles[0].id}
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
                <Link href="/dashboard/clients/new" className="underline underline-offset-2">
                  Create a new client profile
                </Link>
                .
              </p>
            </div>

            {fields.map((f) => (
              <div key={f.id}>
                <label className="block text-sm font-medium text-gray-700" htmlFor={`field-${f.id}`}>
                  {f.name}
                </label>
                {f.type === 'checkbox' ? (
                  <input
                    id={`field-${f.id}`}
                    name={`field_${f.id}`}
                    type="checkbox"
                    className="mt-1 h-4 w-4"
                  />
                ) : f.type === 'drop_down' ? (
                  <select id={`field-${f.id}`} name={`field_${f.id}`} className={inputCls}>
                    <option value="">Select...</option>
                    {f.options.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                ) : f.type === 'number' ? (
                  <input id={`field-${f.id}`} name={`field_${f.id}`} type="number" className={inputCls} />
                ) : f.type === 'date' ? (
                  <input id={`field-${f.id}`} name={`field_${f.id}`} type="date" className={inputCls} />
                ) : f.type === 'url' ? (
                  <input id={`field-${f.id}`} name={`field_${f.id}`} type="url" className={inputCls} />
                ) : (
                  <textarea id={`field-${f.id}`} name={`field_${f.id}`} rows={3} className={inputCls} />
                )}
              </div>
            ))}

            <button className="bg-[#f7cf4a] px-4 py-2 text-sm font-semibold text-black hover:brightness-95">
              Submit request
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
