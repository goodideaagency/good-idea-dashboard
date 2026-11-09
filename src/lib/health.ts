import type Stripe from 'stripe'
import { createAdminClient } from '@/lib/supabase/admin'

// Platform health checks. Plain code, no AI: each check either returns a short
// "what I saw" string (healthy) or throws (unhealthy). `runHealth` runs a set
// of them, remembers what it already reported in `health_check_state` (so one
// problem emails once, not every run), and emails hello@itsgoodidea.com only
// on a change: new failure, 24h reminder, or recovery.
//
// Two tiers:
//   frequent -- "are the connections alive?"  (run every ~6h from QStash)
//   daily    -- everything above PLUS "does our data agree?" (Vercel cron)
// The daily run covering the frequent checks too is deliberate redundancy: if
// the QStash schedule ever dies, the daily run still catches problems, and its
// "frequent-checker-alive" check notices that QStash went quiet.

export type Tier = 'frequent' | 'daily'
export type CheckResult = { key: string; label: string; ok: boolean; detail: string }

type Check = {
  key: string
  label: string
  tier: Tier
  // Returns a short human-readable detail when healthy; throws when not.
  run: () => Promise<string>
}

const TIMEOUT_MS = 15_000
const CLICKUP = 'https://api.clickup.com/api/v2'
// How long a notification batch may sit past its fires_at before it's "stuck".
const STUCK_BATCH_MINUTES = 30
// If the 6-hourly checker hasn't checked in for this long, it's considered dead.
const HEARTBEAT_MAX_HOURS = 13
// A still-failing check re-emails at most this often.
const REMINDER_HOURS = 24
const DEFAULT_ALERT_EMAIL = 'hello@itsgoodidea.com'

function need(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`${name} is not set`)
  return v
}

function appUrl(): string {
  return need('NEXT_PUBLIC_APP_URL').replace(/\/+$/, '')
}

function withTimeout<T>(p: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(
      () => reject(new Error(`timed out after ${TIMEOUT_MS / 1000}s`)),
      TIMEOUT_MS
    )
    p.then(
      (v) => {
        clearTimeout(t)
        resolve(v)
      },
      (e) => {
        clearTimeout(t)
        reject(e)
      }
    )
  })
}

// The last two labels of a hostname ("platform.itsgoodidea.com" -> "itsgoodidea.com").
function baseDomain(host: string): string {
  return host.split('.').slice(-2).join('.')
}

// True when a registered webhook URL is the one we expect: same path (query
// strings and trailing slashes ignored) on either the exact same origin or
// another subdomain of the same site. The latter matters because this app is
// reachable on more than one itsgoodidea.com address (e.g. billing. and
// platform.) and a webhook registered on either still reaches it. Shared hosts
// like *.vercel.app must match exactly, since those belong to other projects.
function sameEndpoint(registered: string, expected: string): boolean {
  try {
    const a = new URL(registered)
    const b = new URL(expected)
    if (a.pathname.replace(/\/+$/, '') !== b.pathname.replace(/\/+$/, '')) return false
    if (a.origin === b.origin) return true
    const shared = baseDomain(b.hostname)
    return shared !== 'vercel.app' && baseDomain(a.hostname) === shared
  } catch {
    return false
  }
}

function sample(items: string[], max = 5): string {
  const shown = items.slice(0, max).join(', ')
  return items.length > max ? `${shown} (+${items.length - max} more)` : shown
}

const LIVE_STATUSES = ['active', 'trialing', 'past_due', 'unpaid'] as const

const CHECKS: Check[] = [
  // ---------- frequent: are the connections alive? ----------
  {
    key: 'supabase',
    label: 'Supabase database',
    tier: 'frequent',
    run: async () => {
      const { error } = await createAdminClient()
        .from('agencies')
        .select('id', { count: 'exact', head: true })
      if (error) throw new Error(error.message)
      return 'database answered'
    },
  },
  {
    key: 'stripe-key',
    label: 'Stripe API key',
    tier: 'frequent',
    run: async () => {
      const { stripe } = await import('@/lib/stripe')
      await stripe.balance.retrieve()
      return 'key accepted'
    },
  },
  {
    key: 'stripe-webhook',
    label: 'Stripe webhook endpoint',
    tier: 'frequent',
    run: async () => {
      const { stripe } = await import('@/lib/stripe')
      const expected = `${appUrl()}/api/stripe/webhook`
      const eps = await stripe.webhookEndpoints.list({ limit: 100 })
      const matches = eps.data.filter((e) => sameEndpoint(e.url, expected))
      if (!matches.length) {
        throw new Error(
          `no Stripe webhook endpoint registered for ${expected} (found: ${
            eps.data.map((e) => e.url).join(', ') || 'none'
          })`
        )
      }
      if (!matches.some((e) => e.status === 'enabled')) {
        throw new Error(`Stripe webhook endpoint for ${expected} is disabled`)
      }
      return 'endpoint registered and enabled'
    },
  },
  {
    key: 'clickup-key',
    label: 'ClickUp API token',
    tier: 'frequent',
    run: async () => {
      const res = await fetch(`${CLICKUP}/user`, {
        headers: { Authorization: need('CLICKUP_API_TOKEN') },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      if (!res.ok) throw new Error(`ClickUp returned ${res.status}`)
      return 'token accepted'
    },
  },
  {
    key: 'clickup-webhooks',
    label: 'ClickUp webhooks',
    tier: 'frequent',
    // ClickUp switches a webhook off after repeated failed deliveries. Once it's
    // off, client notifications silently stop -- nothing else in the app notices.
    run: async () => {
      const headers = { Authorization: need('CLICKUP_API_TOKEN') }
      const get = async (url: string) => {
        const res = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) })
        if (!res.ok) throw new Error(`ClickUp returned ${res.status} for ${url}`)
        return res.json()
      }
      const teams = (await get(`${CLICKUP}/team`)).teams ?? []
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const hooks: any[] = []
      for (const t of teams) {
        const r = await get(`${CLICKUP}/team/${t.id}/webhook`)
        hooks.push(...(r.webhooks ?? []))
      }
      const base = appUrl()
      const expected = [
        { label: 'client', url: `${base}/api/clickup/webhook` },
        { label: 'internal', url: `${base}/api/clickup/webhook/internal` },
      ]
      const problems: string[] = []
      for (const e of expected) {
        const matches = hooks.filter((h) => sameEndpoint(h.endpoint ?? '', e.url))
        if (!matches.length) {
          problems.push(`no ${e.label} webhook registered for ${e.url}`)
        } else if (!matches.some((h) => h.health?.status === 'active')) {
          const h = matches[0]
          problems.push(
            `${e.label} webhook is "${h.health?.status ?? 'unknown'}" (failed deliveries: ${
              h.health?.fail_count ?? '?'
            })`
          )
        }
      }
      if (problems.length) throw new Error(problems.join('; '))
      return 'client and internal webhooks active'
    },
  },
  {
    key: 'resend',
    label: 'Resend email key',
    tier: 'frequent',
    run: async () => {
      need('RESEND_FROM_EMAIL')
      const res = await fetch('https://api.resend.com/domains', {
        headers: { Authorization: `Bearer ${need('RESEND_API_KEY')}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      if (res.ok) return 'key accepted'
      const body = await res.json().catch(() => ({}))
      // A send-only key can't list domains; that response still proves it's valid.
      if (res.status === 401 && body?.name === 'restricted_api_key') {
        return 'key accepted (send-only)'
      }
      throw new Error(`Resend returned ${res.status}${body?.message ? `: ${body.message}` : ''}`)
    },
  },
  {
    key: 'qstash',
    label: 'QStash token',
    tier: 'frequent',
    run: async () => {
      const base = process.env.QSTASH_URL ?? 'https://qstash.upstash.io'
      const res = await fetch(`${base}/v2/schedules`, {
        headers: { Authorization: `Bearer ${need('QSTASH_TOKEN')}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      if (!res.ok) throw new Error(`QStash returned ${res.status}`)
      return 'token accepted'
    },
  },
  {
    key: 'stuck-notifications',
    label: 'Notifications sending on time',
    tier: 'frequent',
    run: async () => {
      const cutoff = new Date(Date.now() - STUCK_BATCH_MINUTES * 60_000).toISOString()
      const { count, error } = await createAdminClient()
        .from('notification_batches')
        .select('id', { count: 'exact', head: true })
        .is('sent_at', null)
        .lte('fires_at', cutoff)
      if (error) throw new Error(error.message)
      if (count) {
        throw new Error(
          `${count} notification batch(es) are more than ${STUCK_BATCH_MINUTES} minutes overdue and still unsent`
        )
      }
      return 'nothing overdue'
    },
  },

  // ---------- daily: does our data agree? ----------
  {
    key: 'stripe-sync',
    label: 'Stripe subscriptions match the dashboard',
    tier: 'daily',
    // Pre-existing Stripe subscriptions only show on the dashboard if they carry
    // agency_id metadata -- untagged ones silently drop off. This also catches
    // missed webhooks (status drift, or a subscription we never recorded).
    run: async () => {
      const { stripe } = await import('@/lib/stripe')
      const admin = createAdminClient()

      const live = new Map<string, Stripe.Subscription>()
      for (const status of LIVE_STATUSES) {
        for await (const s of stripe.subscriptions.list({ status, limit: 100 })) {
          live.set(s.id, s)
          if (live.size >= 2000) break
        }
      }

      const { data: agencies, error: aErr } = await admin
        .from('agencies')
        .select('stripe_customer_id')
        .not('stripe_customer_id', 'is', null)
      if (aErr) throw new Error(aErr.message)
      const agencyCustomers = new Set((agencies ?? []).map((a) => a.stripe_customer_id as string))

      const { data: rows, error: sErr } = await admin
        .from('subscriptions')
        .select('stripe_subscription_id, status')
        .limit(5000)
      if (sErr) throw new Error(sErr.message)
      const ours = new Map((rows ?? []).map((r) => [r.stripe_subscription_id as string, r.status as string]))

      const untagged: string[] = []
      const missing: string[] = []
      const drifted: string[] = []
      for (const s of live.values()) {
        const customer = typeof s.customer === 'string' ? s.customer : s.customer.id
        if (!s.metadata?.agency_id) {
          // Only a problem if it belongs to a known agency's Stripe customer;
          // other subscriptions in the Stripe account aren't ours to track.
          if (agencyCustomers.has(customer)) untagged.push(s.id)
          continue
        }
        if (!ours.has(s.id)) missing.push(s.id)
        else if (ours.get(s.id) !== s.status) drifted.push(`${s.id} (Stripe: ${s.status}, dashboard: ${ours.get(s.id)})`)
      }
      const stale = [...ours.entries()]
        .filter(([id, status]) => (LIVE_STATUSES as readonly string[]).includes(status) && !live.has(id))
        .map(([id, status]) => `${id} (dashboard: ${status})`)

      const problems: string[] = []
      if (untagged.length) problems.push(`${untagged.length} agency subscription(s) missing the agency_id tag, so they won't show on the dashboard: ${sample(untagged)}`)
      if (missing.length) problems.push(`${missing.length} subscription(s) in Stripe but not recorded in the dashboard: ${sample(missing)}`)
      if (drifted.length) problems.push(`${drifted.length} status mismatch(es): ${sample(drifted)}`)
      if (stale.length) problems.push(`${stale.length} subscription(s) shown live on the dashboard but not live in Stripe: ${sample(stale)}`)
      if (problems.length) throw new Error(problems.join(' | '))
      return `${live.size} live subscriptions, all consistent`
    },
  },
  {
    key: 'frequent-checker-alive',
    label: '6-hourly checker is running',
    tier: 'daily',
    // Who watches the watcher: the 6-hourly checks run from QStash. If that
    // schedule is deleted or broken, nothing would say so -- this does.
    run: async () => {
      const { data, error } = await createAdminClient()
        .from('health_check_state')
        .select('last_run_at')
        .eq('check_key', 'heartbeat:frequent')
        .maybeSingle()
      if (error) throw new Error(`could not read health_check_state: ${error.message}`)
      if (!data) throw new Error('the 6-hourly checker has never run -- is the QStash schedule set up?')
      const hours = (Date.now() - new Date(data.last_run_at).getTime()) / 3_600_000
      if (hours > HEARTBEAT_MAX_HOURS) {
        throw new Error(`the 6-hourly checker last ran ${hours.toFixed(1)} hours ago -- the QStash schedule may be broken`)
      }
      return `last ran ${hours.toFixed(1)}h ago`
    },
  },
]

async function runCheck(c: Check): Promise<CheckResult> {
  try {
    const detail = await withTimeout(c.run())
    return { key: c.key, label: c.label, ok: true, detail }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { key: c.key, label: c.label, ok: false, detail: message }
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

async function sendAlertEmail(subject: string, html: string): Promise<{ sent: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM_EMAIL
  if (!apiKey || !from) return { sent: false, error: 'RESEND_API_KEY / RESEND_FROM_EMAIL not set' }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: process.env.HEALTH_ALERT_EMAIL || DEFAULT_ALERT_EMAIL,
        subject,
        html,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) return { sent: false, error: `Resend returned ${res.status}: ${await res.text().catch(() => '')}` }
    return { sent: true }
  } catch (err) {
    return { sent: false, error: err instanceof Error ? err.message : String(err) }
  }
}

function section(title: string, results: CheckResult[], color: string): string {
  if (!results.length) return ''
  const items = results
    .map((r) => `<li><strong>${escapeHtml(r.label)}</strong><br>${escapeHtml(r.detail)}</li>`)
    .join('')
  return `<h3 style="color:${color};margin:20px 0 6px">${title}</h3><ul style="padding-left:18px;line-height:1.5">${items}</ul>`
}

type StateRow = {
  check_key: string
  status: 'ok' | 'failing'
  failing_since: string | null
  last_alerted_at: string | null
}

export type HealthReport = {
  tier: Tier
  ok: boolean
  results: CheckResult[]
  production: boolean
  stateAvailable: boolean
  email: 'sent' | 'not-needed' | 'skipped-not-production' | 'failed'
  emailError?: string
}

export async function runHealth(
  tier: Tier,
  opts: { production: boolean; testEmail?: boolean }
): Promise<HealthReport> {
  const checks = CHECKS.filter((c) => tier === 'daily' || c.tier === 'frequent')
  const results = await Promise.all(checks.map(runCheck))
  const failing = results.filter((r) => !r.ok)
  const admin = createAdminClient()

  const report: HealthReport = {
    tier,
    ok: failing.length === 0,
    results,
    production: opts.production,
    stateAvailable: true,
    email: 'not-needed',
  }

  // A manual test email, to confirm delivery end to end.
  if (opts.testEmail) {
    const sent = await sendAlertEmail(
      '[Good Idea Platform] Test alert',
      `<p>This is a test of the platform health alerts. If you can read this, alerts are reaching you.</p>${section(
        'Current check results',
        results,
        '#333'
      )}`
    )
    report.email = sent.sent ? 'sent' : 'failed'
    report.emailError = sent.error
    return report
  }

  // Preview/local runs are read-only dry runs: no state writes, no emails (a
  // staging deploy shouldn't mark production checks failing or email anyone).
  if (!opts.production) {
    report.email = 'skipped-not-production'
    return report
  }

  // What did we already tell the owner about?
  const { data: stateRows, error: stateErr } = await admin
    .from('health_check_state')
    .select('check_key, status, failing_since, last_alerted_at')
  const stateOk = !stateErr
  report.stateAvailable = stateOk
  const prev = new Map<string, StateRow>(((stateRows ?? []) as StateRow[]).map((r) => [r.check_key, r]))

  const now = Date.now()
  const newlyFailing: CheckResult[] = []
  const stillFailing: CheckResult[] = []
  const recovered: CheckResult[] = []
  for (const r of results) {
    const p = prev.get(r.key)
    if (!r.ok) {
      if (!p || p.status === 'ok' || !stateOk) newlyFailing.push(r)
      else if (!p.last_alerted_at || now - new Date(p.last_alerted_at).getTime() > REMINDER_HOURS * 3_600_000) {
        stillFailing.push(r)
      }
    } else if (p?.status === 'failing') {
      recovered.push(r)
    }
  }

  // Weekly "all good" summary, riding on the Monday daily run.
  const isWeeklySummary = tier === 'daily' && new Date().getUTCDay() === 1

  let sent: { sent: boolean; error?: string } | null = null
  if (newlyFailing.length || stillFailing.length || recovered.length) {
    const problems = newlyFailing.length + stillFailing.length
    const subject = problems
      ? `[Good Idea Platform] ${problems} problem${problems === 1 ? '' : 's'} detected`
      : '[Good Idea Platform] Recovered'
    const html =
      section('New problems', newlyFailing, '#b91c1c') +
      section('Still not fixed (daily reminder)', stillFailing, '#b45309') +
      section('Recovered', recovered, '#15803d') +
      `<p style="color:#666;font-size:12px;margin-top:24px">Sent by the platform health checker (${tier} run).</p>`
    sent = await sendAlertEmail(subject, html)
  } else if (isWeeklySummary) {
    const lines = failing.length
      ? section('Still failing', failing, '#b45309')
      : '<p>Everything is healthy.</p>'
    sent = await sendAlertEmail(
      `[Good Idea Platform] Weekly summary: ${failing.length ? `${failing.length} issue(s) open` : 'all healthy'}`,
      `${lines}${section('All checks', results.filter((r) => r.ok), '#15803d')}`
    )
  }
  if (sent) {
    report.email = sent.sent ? 'sent' : 'failed'
    report.emailError = sent.error
  }

  // Remember what we saw. last_alerted_at only moves when the email actually
  // went out, so a failed send is retried next run instead of being lost.
  const alertedKeys = new Set([...newlyFailing, ...stillFailing].map((r) => r.key))
  const nowIso = new Date().toISOString()
  const upserts = results.map((r) => {
    const p = prev.get(r.key)
    const emailedNow = sent?.sent === true && alertedKeys.has(r.key)
    return {
      check_key: r.key,
      status: r.ok ? 'ok' : 'failing',
      detail: r.detail,
      failing_since: r.ok ? null : p?.failing_since ?? nowIso,
      last_alerted_at: r.ok ? null : emailedNow ? nowIso : p?.last_alerted_at ?? null,
      last_run_at: nowIso,
    }
  })
  if (tier === 'frequent') {
    upserts.push({
      check_key: 'heartbeat:frequent',
      status: 'ok',
      detail: 'checker ran',
      failing_since: null,
      last_alerted_at: null,
      last_run_at: nowIso,
    })
  }
  const { error: writeErr } = await admin.from('health_check_state').upsert(upserts, { onConflict: 'check_key' })
  if (writeErr) report.stateAvailable = false

  return report
}

// Minimal liveness probe for uptime pingers: can the app reach its database?
export async function quickLivenessCheck(): Promise<boolean> {
  try {
    const { error } = await withTimeout(
      Promise.resolve(createAdminClient().from('agencies').select('id', { head: true, count: 'exact' }))
    )
    return !error
  } catch {
    return false
  }
}
