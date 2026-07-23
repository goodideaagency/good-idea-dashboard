import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { listPlansForAgency } from '@/lib/plans'
import { AddServiceForm } from '@/components/add-service-form'
import { addServiceAndCheckout } from '../actions'

export default async function AddAccountPage() {
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

  const [plans, { data: accounts }] = await Promise.all([
    listPlansForAgency(agencyName),
    supabase.from('accounts').select('id, name').order('name'),
  ])

  return (
    <div className="p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold text-gray-900">Add a service</h1>
        <Link
          href="/dashboard/accounts"
          className="border border-[#e7e2d3] px-3 py-1.5 text-sm text-gray-700 hover:bg-[#f6f1e4] font-mono uppercase tracking-wide"
        >
          ← Back
        </Link>
      </div>

      <div className="mt-6 max-w-xl bg-white p-6 ring-1 ring-[#ece7d8]">
        <AddServiceForm
          action={addServiceAndCheckout}
          plans={plans}
          accounts={(accounts ?? []).map((a) => ({ id: a.id, name: a.name }))}
        />
      </div>
    </div>
  )
}
