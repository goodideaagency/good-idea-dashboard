import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isAdmin } from '@/lib/admin-auth'
import { stripe } from '@/lib/stripe'

// TEMPORARY -- checking the live webhook endpoint's subscribed events ahead
// of building payment-failure notifications (2026-08-31). Delete once done.
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!(await isAdmin(user?.email))) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const body = await req.json()
  const { action, id, enabledEvents } = body as {
    action: 'list_webhooks' | 'update_webhook_events' | 'delete_webhook'
    id?: string
    enabledEvents?: string[]
  }

  if (action === 'list_webhooks') {
    const endpoints = await stripe.webhookEndpoints.list({ limit: 20 })
    return NextResponse.json({ endpoints: endpoints.data })
  }

  if (action === 'update_webhook_events' && id && enabledEvents) {
    const updated = await stripe.webhookEndpoints.update(id, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      enabled_events: enabledEvents as any,
    })
    return NextResponse.json({ updated: { id: updated.id, enabled_events: updated.enabled_events } })
  }

  if (action === 'delete_webhook' && id) {
    const deleted = await stripe.webhookEndpoints.del(id)
    return NextResponse.json({ deleted })
  }

  return NextResponse.json({ error: 'bad request' }, { status: 400 })
}
