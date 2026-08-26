// Schedules a one-off delayed callback via Upstash QStash -- used to flush a
// notification batch at exactly its fires_at time, without polling. If
// QSTASH_TOKEN isn't set yet, this silently no-ops (batches still accumulate
// in the DB, they just won't auto-flush until the token is added).
export async function scheduleFlush(batchId: string, delaySeconds: number): Promise<void> {
  const token = process.env.QSTASH_TOKEN
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (!token || !appUrl) return

  // On a Vercel Preview deployment, Deployment Protection blocks unauthenticated
  // requests -- including QStash's own callback -- unless this bypass token is
  // appended. Harmless/no-op once this app URL is a production domain without
  // protection.
  const bypass = process.env.VERCEL_PROTECTION_BYPASS
  const callbackUrl = `${appUrl}/api/notifications/flush${bypass ? `?x-vercel-protection-bypass=${bypass}` : ''}`

  // Upstash accounts are region-pinned; the generic qstash.upstash.io host
  // 404s for a region-pinned account, so QSTASH_URL (from the Upstash
  // console) must be used instead.
  const qstashBase = process.env.QSTASH_URL ?? 'https://qstash.upstash.io'

  try {
    const res = await fetch(`${qstashBase}/v2/publish/${callbackUrl}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Upstash-Delay': `${delaySeconds}s`,
        // Forwarded verbatim to our flush route by QStash -- a lightweight
        // shared-secret check since the callback URL is otherwise public.
        'Upstash-Forward-X-Internal-Secret': process.env.INTERNAL_FLUSH_SECRET ?? '',
      },
      body: JSON.stringify({ batchId }),
    })
    // A failed schedule here previously vanished completely -- worst case
    // was this batch silently sitting open for up to 24h until the daily
    // cron sweep (see /api/notifications/sweep) caught it, with nothing
    // anywhere to show that had happened.
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error(`scheduleFlush: QStash returned ${res.status} for batch ${batchId}: ${body}`)
    }
  } catch (err) {
    // Still best-effort -- worst case the batch sits open until the daily
    // cron sweep catches it. Logged so that's a rare, visible fallback
    // instead of a silent, invisible one.
    console.error('scheduleFlush: request failed:', err)
  }
}
