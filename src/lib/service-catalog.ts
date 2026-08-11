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
  sections?: FieldSection[]
}

// The Custom Field (shared across every List in the Internal Ops > One-Time
// Projects folder -- created once, ClickUp reuses it by name for every List
// it's added to) that holds a task's current total credit cost. The team
// edits this directly in ClickUp to add/lower a task's cost after the fact;
// the ClickUp webhook reconciles the difference against credit_charges (see
// reconcileTaskCost in lib/credits.ts).
export const CREDIT_COST_FIELD_ID = 'd3a43790-4712-4aba-bd9c-40bcfeb3952f'

// Optional grouping for a long intake form -- purely a rendering concern
// (see ServiceFormFields), so the fields inside still must also appear in
// fieldIds above. Kept as a separate list rather than deriving fieldIds from
// this, so a field can still be included even if a service ever wants it
// ungrouped.
export type FieldSection = { title: string; fieldIds: string[] }

// A one-time service also carries its base credit cost -- deducted from the
// agency's credit bank when the request is submitted (see
// dashboard/request/[key]/actions.ts). The team can raise or lower a given
// task's actual cost later via the Credit Cost field in ClickUp; only the
// difference from this base gets charged/refunded (reconcileTaskCost).
export type OneTimeServiceDef = ServiceDef & { baseCreditCost: number }

export const ONE_TIME_SERVICES: OneTimeServiceDef[] = [
  {
    key: 'consulting-30',
    label: 'Consulting (30 min)',
    internalListId: '901419012372',
    baseCreditCost: 1,
    fieldIds: [],
  },
  {
    key: 'ad-idea',
    label: 'Ad Idea',
    internalListId: '901419012373',
    baseCreditCost: 1,
    fieldIds: [],
  },
  {
    key: 'ad-design',
    label: 'Ad Design',
    internalListId: '901418378719',
    baseCreditCost: 2,
    fieldIds: [],
  },
  {
    key: 'ppc-account-audit',
    label: 'PPC Account Audit',
    internalListId: '901418382325',
    templateId: 't-86bb24h91',
    baseCreditCost: 2,
    fieldIds: [
      '7128daaa-752c-448b-8966-eb3ded4f76f6', // Ad platform(s)
      '9329b5d4-bbd2-4f22-8034-33691ad57932', // Link to ad account
      '1bf6a853-4f69-4b5d-ac48-9befb405f00d', // What prompted this audit?
    ],
  },
  {
    key: 'basic-tracking-setup',
    label: 'Basic Tracking Setup',
    internalListId: '901419012375',
    baseCreditCost: 4,
    fieldIds: [],
  },
  {
    key: 'advanced-tracking-setup',
    label: 'Advanced Tracking Setup',
    internalListId: '901419012376',
    baseCreditCost: 6,
    fieldIds: [],
  },
  {
    key: 'ppc-account-setup',
    label: 'PPC Account Set Up',
    internalListId: '901419012377',
    baseCreditCost: 6,
    fieldIds: [],
  },
]

export function getServiceByKey(key: string): OneTimeServiceDef | undefined {
  return ONE_TIME_SERVICES.find((s) => s.key === key)
}

// Recurring/managed services -- same shape and same "why fieldIds is an
// allow-list" reasoning as ONE_TIME_SERVICES above, but keyed by Stripe
// Price id (that's the only stable identifier we have coming out of
// Checkout) instead of a hand-picked slug. clientTaskName is what shows up
// on the client's own List once intake is submitted, with status "ongoing"
// -- matching the existing "Ongoing Services" card convention.
export type ManagedServiceDef = ServiceDef & {
  priceId: string
  clientTaskName: string
}

// PPC Management intake -- grouped to match the flow of the original WL PPC
// client onboarding form: who they are, then the business, then their
// customers/competition, then goals/budget, then campaign specifics, then
// catch-all, then the access checklist last.
const PPC_MANAGEMENT_LIST_ID = '901418378713' // Recurring Services > PPC Management

const PPC_SECTIONS: FieldSection[] = [
  {
    title: 'Client Info',
    fieldIds: [
      '991c0ad2-2c3a-49cf-b0ce-0b659e58fa12', // Your Name
      '90ed1917-d502-4a88-a2a3-3b6db82986a7', // The name of your Client Company
      '218cf45d-7ec2-4984-af38-4d595f5583d2', // Who is the contact person for this account?
      'e45f193c-26f1-4b40-b687-d8eb9420febf', // Email address for lead notifications
    ],
  },
  {
    title: 'Business Background',
    fieldIds: [
      '0b662f3d-79db-4b16-b3ed-2c0651bf91da', // How many years has the client been in business?
      'b0322111-ba6f-4593-ab4a-748afdf655e9', // Tell us about the business as if we had never heard of it
      '4d234b43-2ba1-4d4b-ab0e-443502c9728c', // What are the services you want to advertise?
      '741fa6b3-aab9-47da-b049-20b24da814d4', // Which of those services are the top 1-3 most profitable?
      '0321fa07-f378-4839-9891-857014475737', // What is the business specific value proposition?
      '38a3f02c-62ca-447f-8a35-a7c739a9e7d5', // Most distinguishing characteristics / what makes it stand out?
      '63db4bf2-5080-49f5-946c-6231580f52e6', // Do you have any awards or certifications?
    ],
  },
  {
    title: 'Customers & Competition',
    fieldIds: [
      'd107eaab-b33f-4d2e-a45c-8716d545b249', // Please describe your ideal customer profiles
      '2a378252-a5b0-47f9-b238-b249d3b59ab6', // What emotions/feelings do you want to create?
      '6c0554e3-6f9f-4640-b148-e211022d38d4', // Who are your top 5 competitors?
      '1006afdc-53c0-4340-8e3f-722e5a683bc4', // Do you offer any discounts?
      'a6cebe6f-bacf-4323-94c0-9bf0741ffa63', // Do you have any special offers or guarantees?
    ],
  },
  {
    title: 'Goals & Budget',
    fieldIds: [
      '30c88d8b-659d-4093-a013-8b76483730aa', // Current weekly leads/sales, and target?
      '858f26c4-3a20-459d-844b-248bf2e2b816', // How would you define success 3 months from now?
      'dfc13887-2e24-46ba-8050-7d8eea47792c', // What is the average monetary value of a new client?
      '0a61b680-cffe-4c6f-a3f3-578ae8f92172', // What is your target CPA?
      'aedfaf72-0775-44d6-8b21-e3a8917c2dfc', // What will be the monthly budget for the campaign?
    ],
  },
  {
    title: 'Campaign & Targeting',
    fieldIds: [
      'a79ce891-5809-4e48-aada-c9eb0fbd29b7', // Will the ads run on a schedule?
      'b33b669a-5ddd-4d70-88c8-d86d6684d9e1', // Best guess at 5-10 keywords?
      'e3aa9ccd-7bdc-46c9-b8fc-7f0d769ed76e', // Which keywords should we NOT target?
      '147978ce-7b7a-459b-af97-7f91b30d4df2', // What cities or towns do you want to be found in?
      '56397989-5d88-41d3-943f-c10aa7903c98', // Landing page URLs
      '4ba93546-871a-4967-bc7e-e828f8d7fbc1', // Calls to action / next steps for visitors?
    ],
  },
  {
    title: 'Anything Else',
    fieldIds: [
      'f9e0c099-78b7-48da-8c5f-752855144126', // Anything you do not want to mention or talk about?
      '44d666d7-f41d-4334-8754-f01e8838dcf5', // Anything else we should know?
    ],
  },
  {
    title: 'Access Checklist',
    fieldIds: [
      '1282f405-6ad0-4120-8313-5b9ada459389', // Website Admin
      'af1af199-49da-44d3-b5d2-e5d54f6f6c69', // Google Ads
      'a4441d13-cced-4ff7-84c8-1bc017326345', // Google Analytics
      'c2820c13-eed6-4a68-921e-c70b90d235a3', // Google Search Console
      '48b3d4a4-a27b-417e-aa49-19dc64a6c451', // Google Business Profile
      'd5f071d8-3a1a-4001-8bf4-a32536d25d9c', // Google Tag Manager
      '031359ae-66a7-4d60-8220-6c12bd05557c', // Facebook
      '6fa7b567-4010-478d-b628-4f0e59c44c19', // Instagram
    ],
  },
]

const PPC_FIELD_IDS = PPC_SECTIONS.flatMap((s) => s.fieldIds)

// Meta Ads Management intake -- same shape as PPC's, minus the Google
// Ads/Search Console/Business Profile/Tag Manager access items (not
// relevant to Meta), plus an extra "Your Company" question, and "top 3"
// competitors instead of "top 5" -- matching the actual WL META onboarding
// form fields 1:1. Several field ids below are literally the same as PPC's
// (ClickUp reuses a Custom Field across Lists in the same Folder when the
// name matches exactly) -- harmless, since the allow-list is what actually
// scopes which fields render on which form.
const META_ADS_LIST_ID = '901418998137' // Recurring Services > Meta Ads Management

const META_ADS_SECTIONS: FieldSection[] = [
  {
    title: 'Client Info',
    fieldIds: [
      '991c0ad2-2c3a-49cf-b0ce-0b659e58fa12', // Your Name
      'eb602b39-d957-45c5-863d-f09c58672048', // Your Company
      '90ed1917-d502-4a88-a2a3-3b6db82986a7', // The name of your Client Company
      '218cf45d-7ec2-4984-af38-4d595f5583d2', // Who is the contact person for this account?
      'e45f193c-26f1-4b40-b687-d8eb9420febf', // Email address for lead notifications
    ],
  },
  {
    title: 'Business Background',
    fieldIds: [
      '0b662f3d-79db-4b16-b3ed-2c0651bf91da', // How many years has the client been in business?
      'b0322111-ba6f-4593-ab4a-748afdf655e9', // Tell us about the business as if we had never heard of it
      '4d234b43-2ba1-4d4b-ab0e-443502c9728c', // What are the services you want to advertise?
      '741fa6b3-aab9-47da-b049-20b24da814d4', // Which of those services are the top 1-3 most profitable?
      '0321fa07-f378-4839-9891-857014475737', // What is the business specific value proposition?
      '38a3f02c-62ca-447f-8a35-a7c739a9e7d5', // Most distinguishing characteristics / what makes it stand out?
      '63db4bf2-5080-49f5-946c-6231580f52e6', // Do you have any awards or certifications?
    ],
  },
  {
    title: 'Customers & Competition',
    fieldIds: [
      'd107eaab-b33f-4d2e-a45c-8716d545b249', // Please describe your ideal customer profiles
      '2a378252-a5b0-47f9-b238-b249d3b59ab6', // What emotions/feelings do you want to create?
      '1639ccab-b5f1-4467-9023-b9456a2f4103', // Who are your top 3 competitors?
      '1006afdc-53c0-4340-8e3f-722e5a683bc4', // Do you offer any discounts?
      'a6cebe6f-bacf-4323-94c0-9bf0741ffa63', // Do you have any special offers or guarantees?
    ],
  },
  {
    title: 'Goals & Budget',
    fieldIds: [
      '30c88d8b-659d-4093-a013-8b76483730aa', // Current weekly leads/sales, and target?
      '858f26c4-3a20-459d-844b-248bf2e2b816', // How would you define success 3 months from now?
      'dfc13887-2e24-46ba-8050-7d8eea47792c', // What is the average monetary value of a new client?
      '0a61b680-cffe-4c6f-a3f3-578ae8f92172', // What is your target CPA?
      'aedfaf72-0775-44d6-8b21-e3a8917c2dfc', // What will be the monthly budget for the campaign?
    ],
  },
  {
    title: 'Campaign & Targeting',
    fieldIds: [
      'a79ce891-5809-4e48-aada-c9eb0fbd29b7', // Will the ads run on a schedule?
      'b33b669a-5ddd-4d70-88c8-d86d6684d9e1', // Best guess at 5-10 keywords?
      'e3aa9ccd-7bdc-46c9-b8fc-7f0d769ed76e', // Which keywords should we NOT target?
      '147978ce-7b7a-459b-af97-7f91b30d4df2', // What cities or towns do you want to be found in?
      '56397989-5d88-41d3-943f-c10aa7903c98', // Landing page URLs
      '4ba93546-871a-4967-bc7e-e828f8d7fbc1', // Calls to action / next steps for visitors?
    ],
  },
  {
    title: 'Anything Else',
    fieldIds: [
      'f9e0c099-78b7-48da-8c5f-752855144126', // Anything you do not want to mention or talk about?
      '44d666d7-f41d-4334-8754-f01e8838dcf5', // Anything else we should know?
    ],
  },
  {
    title: 'Access Checklist',
    fieldIds: [
      '1282f405-6ad0-4120-8313-5b9ada459389', // Website Admin
      'a4441d13-cced-4ff7-84c8-1bc017326345', // Google Analytics
      '031359ae-66a7-4d60-8220-6c12bd05557c', // Facebook
      '6fa7b567-4010-478d-b628-4f0e59c44c19', // Instagram
    ],
  },
]

const META_ADS_FIELD_IDS = META_ADS_SECTIONS.flatMap((s) => s.fieldIds)

export const MANAGED_SERVICES: ManagedServiceDef[] = [
  {
    priceId: 'price_1TuxIbFMJ3Zn4Zd2x38gJoxs',
    key: 'wl-ppc-growth',
    label: 'White Label PPC — Growth',
    clientTaskName: 'White Label PPC — Monthly Management',
    internalListId: PPC_MANAGEMENT_LIST_ID,
    fieldIds: PPC_FIELD_IDS,
    sections: PPC_SECTIONS,
  },
  {
    priceId: 'price_1TuxIbFMJ3Zn4Zd2Dgih5ndu',
    key: 'wl-ppc-starter',
    label: 'White Label PPC — Starter',
    clientTaskName: 'White Label PPC — Monthly Management',
    internalListId: PPC_MANAGEMENT_LIST_ID,
    fieldIds: PPC_FIELD_IDS,
    sections: PPC_SECTIONS,
  },
  {
    priceId: 'price_1S7xx2FMJ3Zn4Zd2lrdjo9SK',
    key: 'wl-meta-ads',
    label: 'White Label Meta Ads',
    clientTaskName: 'White Label Meta Ads — Monthly Management',
    internalListId: META_ADS_LIST_ID,
    fieldIds: META_ADS_FIELD_IDS,
    sections: META_ADS_SECTIONS,
  },
]

export function getManagedServiceByPriceId(priceId: string): ManagedServiceDef | undefined {
  return MANAGED_SERVICES.find((s) => s.priceId === priceId)
}
