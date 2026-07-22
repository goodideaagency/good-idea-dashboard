const ACTIVE = new Set(['active', 'trialing'])

// Normalizes any billing interval to a monthly amount (cents).
function monthlyCents(amountCents: number | null, interval: string | null): number {
  if (!amountCents) return 0
  switch (interval) {
    case 'year':
      return amountCents / 12
    case 'week':
      return (amountCents * 52) / 12
    case 'day':
      return (amountCents * 365) / 12
    case 'month':
    default:
      return amountCents
  }
}

// Sums monthly recurring revenue across active/trialing subscriptions only.
export function calculateMrrCents(
  subs: { status: string | null; amount_cents: number | null; interval: string | null }[]
): number {
  return subs
    .filter((s) => s.status && ACTIVE.has(s.status))
    .reduce((sum, s) => sum + monthlyCents(s.amount_cents, s.interval), 0)
}

export function formatMoney(cents: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(cents / 100)
}
