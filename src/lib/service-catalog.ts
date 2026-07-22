// One-time services an agency can request without going through Stripe
// checkout (audits, design work, etc.). Each maps to its Internal Ops List --
// that's where the intake questions (Custom Fields) live, and where the
// paired internal task gets created for the team to pick up. If templateId
// is set, the internal task is created from that ClickUp Task Template
// (checklist/description included) instead of created blank.
//
// fieldIds is an explicit allow-list of which of that List's Custom Fields
// are this service's intake questions. This is necessary because ClickUp
// does NOT cleanly scope a Custom Field to a single List -- fields can show
// up on other Lists in the same Space/Folder too (confirmed empirically: a
// field created for one service leaked onto a sibling service's form).
// Editing a question's wording/type/options still happens in ClickUp; this
// list just says which of them belong to this particular form.
export type ServiceDef = {
  key: string
  label: string
  internalListId: string
  templateId?: string
  fieldIds: string[]
}

export const ONE_TIME_SERVICES: ServiceDef[] = [
  {
    key: 'account-audit',
    label: 'Account Audit',
    internalListId: '901418378720',
    fieldIds: [
      'e9cc7cf7-f5d1-494e-b8c6-ab0d78f03a9b', // Website URL
      '1140983b-d118-4c24-9151-5dfd121a7198', // What should we focus on?
      'c32e352d-893f-44cc-b1fe-31e0c76ec652', // Rush this audit?
    ],
  },
  {
    key: 'ppc-audit',
    label: 'PPC Audit',
    internalListId: '901418382325',
    templateId: 't-86bb24h91',
    fieldIds: [
      '7128daaa-752c-448b-8966-eb3ded4f76f6', // Ad platform(s)
      '9329b5d4-bbd2-4f22-8034-33691ad57932', // Link to ad account
      '1bf6a853-4f69-4b5d-ac48-9befb405f00d', // What prompted this audit?
    ],
  },
]

export function getServiceByKey(key: string): ServiceDef | undefined {
  return ONE_TIME_SERVICES.find((s) => s.key === key)
}
