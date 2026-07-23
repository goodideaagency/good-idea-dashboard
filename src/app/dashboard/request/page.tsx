import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ONE_TIME_SERVICES } from '@/lib/service-catalog'
import { listPlansForAgency } from '@/lib/plans'

export default async function RequestServicePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('agency_users')
    .select('agencies(name)')
    .eq('user_id', user.id)
    .maybeSingle()
  const agencyName = (membership?.agencies as { name?: string } | null)?.name ?? ''
  const plans = await listPlansForAgency(agencyName)

  return (
    <div className="p-8">
      <h1 className="text-3xl font-semibold text-gray-900">Start a new project</h1>
      <p className="mt-1 text-sm text-gray-500">Select a service below to start your new project.</p>

      <p className="mt-10 text-xs font-mono uppercase tracking-wide text-gray-400">Services</p>
      <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {ONE_TIME_SERVICES.map((s) => (
          <div
            key={s.key}
            className="flex flex-col justify-between bg-[#F5EFE2] p-6 ring-1 ring-[#ece7d8]"
          >
            <p className="text-lg font-semibold text-gray-900">{s.label}</p>
            <Link
              href={`/dashboard/request/${s.key}`}
              className="mt-8 flex items-center justify-center gap-2 bg-[#1a1a1a] px-4 py-2.5 text-sm font-semibold text-white hover:brightness-110"
            >
              Start This Service
            </Link>
          </div>
        ))}
      </div>

      <p className="mt-10 text-xs font-mono uppercase tracking-wide text-gray-400">Managed Account</p>
      {plans.length === 0 ? (
        <p className="mt-4 text-sm text-gray-500">
          No managed plans available for your agency yet. Contact Good Idea to get set up.
        </p>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {plans.map((p) => (
            <div
              key={p.id}
              className="flex flex-col justify-between bg-[#F5EFE2] p-6 ring-1 ring-[#ece7d8]"
            >
              <p className="text-lg font-semibold text-gray-900">{p.label}</p>
              <Link
                href={`/dashboard/add?plan=${encodeURIComponent(p.id)}`}
                className="mt-8 flex items-center justify-center gap-2 bg-[#1a1a1a] px-4 py-2.5 text-sm font-semibold text-white hover:brightness-110"
              >
                Start This Service
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
