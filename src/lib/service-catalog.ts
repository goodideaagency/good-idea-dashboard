// One-time services an agency can request without going through Stripe
// checkout (audits, design work, etc.). Each maps to its Internal Ops List --
// that's where the intake questions (Custom Fields) live, and where the
// paired internal task gets created for the team to pick up.
export type ServiceDef = {
  key: string
  label: string
  internalListId: string
}

export const ONE_TIME_SERVICES: ServiceDef[] = [
  { key: 'account-audit', label: 'Account Audit', internalListId: '901418378720' },
]

export function getServiceByKey(key: string): ServiceDef | undefined {
  return ONE_TIME_SERVICES.find((s) => s.key === key)
}
