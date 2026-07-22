import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ONE_TIME_SERVICES } from '@/lib/service-catalog'

export default async function RequestServicePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div className="p-8">
      <h1 className="text-3xl font-semibold text-gray-900">Request a service</h1>
      <p className="mt-1 text-sm text-gray-500">One-time project work, no subscription required.</p>

      <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {ONE_TIME_SERVICES.map((s) => (
          <Link
            key={s.key}
            href={`/dashboard/request/${s.key}`}
            className="flex flex-col justify-between bg-[#F5EFE2] p-6 ring-1 ring-[#ece7d8] hover:brightness-95"
          >
            <p className="text-lg font-semibold text-gray-900">{s.label}</p>
            <p className="mt-8 text-sm font-medium text-gray-900">Request →</p>
          </Link>
        ))}
      </div>
    </div>
  )
}
