import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { verifyClickUpSignature } from '@/lib/clickup-webhooks'
import { createAdminClient } from '@/lib/supabase/admin'
import { reconcileTaskCost } from '@/lib/credits'
import { CREDIT_COST_FIELD_ID } from '@/lib/service-catalog'

// Receives task changes for the "Internal Ops" Space -- a separate endpoint
// and secret from the client-facing webhook (route.ts one level up) since
// the two are registered against different Spaces. Only cares about edits to
// the shared "Credit Cost" Custom Field; everything else is ignored.
export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const signature = req.headers.get('x-signature')
  if (!verifyClickUpSignature(rawBody, signature, process.env.CLICKUP_INTERNAL_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let payload: any
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ ok: true })
  }

  const taskId = payload.task_id as string | undefined
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const historyItems: any[] = payload.history_items ?? []
  const costChange = historyItems.find(
    (h) => h.field === 'custom_field' && h.field_id === CREDIT_COST_FIELD_ID
  )
  if (!taskId || !costChange) return NextResponse.json({ ok: true })

  const newTotalCost = Number(costChange.after ?? costChange.value ?? 0)
  if (!Number.isFinite(newTotalCost) || newTotalCost < 0) return NextResponse.json({ ok: true })

  const admin = createAdminClient()
  const { data: request } = await admin
    .from('service_requests')
    .select('agency_id, account_id')
    .eq('clickup_task_id', taskId)
    .maybeSingle()
  if (!request) return NextResponse.json({ ok: true })

  await reconcileTaskCost(request.agency_id, request.account_id, taskId, newTotalCost)
  revalidatePath('/dashboard', 'layout')
  return NextResponse.json({ ok: true })
}
