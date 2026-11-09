import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { runHealth, type Tier } from '@/lib/health'

// Runs the platform health checks and emails on problems (see lib/health.ts).
//
// Callers:
//   - Vercel Cron (daily): sends `Authorization: Bearer <CRON_SECRET>`.
//   - QStash schedule (every ~6h): forwards `x-internal-secret: <INTERNAL_FLUSH_SECRET>`.
// Query: ?tier=frequent|daily (default daily), ?test=1 sends a test email.
export const maxDuration = 60

function safeEqual(a: string | null, b: string | undefined): boolean {
  if (!a || !b) return false
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb)
}

async function handle(req: NextRequest) {
  const authorized =
    safeEqual(req.headers.get('authorization'), process.env.CRON_SECRET ? `Bearer ${process.env.CRON_SECRET}` : undefined) ||
    safeEqual(req.headers.get('x-internal-secret'), process.env.INTERNAL_FLUSH_SECRET)
  if (!authorized) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const tier: Tier = req.nextUrl.searchParams.get('tier') === 'frequent' ? 'frequent' : 'daily'
  const report = await runHealth(tier, {
    // Only the real production deployment writes state / sends email.
    production: process.env.VERCEL_ENV === 'production',
    testEmail: req.nextUrl.searchParams.get('test') === '1',
  })
  return NextResponse.json(report)
}

export const GET = handle
export const POST = handle
