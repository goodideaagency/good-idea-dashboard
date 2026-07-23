import { NextRequest, NextResponse } from 'next/server'
import { flushBatch } from '@/lib/notification-batches'

// Called by QStash at a batch's scheduled fires_at time (see qstash.ts).
export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-internal-secret')
  if (!process.env.INTERNAL_FLUSH_SECRET || secret !== process.env.INTERNAL_FLUSH_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { batchId } = await req.json()
  if (!batchId) return NextResponse.json({ error: 'missing batchId' }, { status: 400 })

  await flushBatch(batchId)
  return NextResponse.json({ ok: true })
}
