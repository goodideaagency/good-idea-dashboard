import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { flushBatch } from '@/lib/notification-batches'

// Backstop for scheduleFlush's own QStash call (see qstash.ts) failing to
// even reach QStash -- that call is deliberately best-effort/fire-and-forget,
// so without this, a batch whose scheduling request itself was lost would
// sit open forever with nothing ever flushing it. Vercel Cron hits this on
// a schedule (see vercel.json) and sweeps up anything overdue.
//
// Vercel automatically adds `Authorization: Bearer <CRON_SECRET>` to its own
// cron-triggered requests when a CRON_SECRET env var is set -- this checks
// against that same value, so the endpoint can't be triggered by anyone else.
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const { data: overdue } = await admin
    .from('notification_batches')
    .select('id')
    .is('sent_at', null)
    .lte('fires_at', new Date().toISOString())
    .limit(200)

  for (const batch of overdue ?? []) {
    await flushBatch(batch.id)
  }

  return NextResponse.json({ swept: overdue?.length ?? 0 })
}
