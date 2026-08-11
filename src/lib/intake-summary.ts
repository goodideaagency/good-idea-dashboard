import type { ClickUpField } from './clickup'
import type { FieldSection } from './service-catalog'

function formatValue(f: ClickUpField, value: unknown): string {
  if (value === undefined || value === null || value === '') return '—'
  if (f.type === 'checkbox') return value ? 'Yes' : 'No'
  if (f.type === 'drop_down') {
    const opt = f.options.find((o) => o.id === value)
    return opt?.name ?? String(value)
  }
  if (f.type === 'date' && typeof value === 'number') {
    return new Date(value).toLocaleDateString()
  }
  return String(value)
}

function block(fields: ClickUpField[], values: Map<string, unknown>): string {
  return fields.map((f) => `**${f.name}:** ${formatValue(f, values.get(f.id))}`).join('\n\n')
}

// Builds a markdown summary of a submitted intake form, grouped into the
// service's sections when it has them -- this becomes the task's
// markdown_description so the team sees a clean, readable writeup at the top
// of the task instead of having to scroll ClickUp's cramped, truncated
// Custom Fields sidebar to piece the answers together.
export function formatIntakeSummary(
  fields: ClickUpField[],
  sections: FieldSection[] | undefined,
  customFields: { id: string; value: unknown }[]
): string {
  const values = new Map(customFields.map((cf) => [cf.id, cf.value]))

  if (sections && sections.length > 0) {
    return sections
      .map((s) => {
        const sectionFields = s.fieldIds
          .map((id) => fields.find((f) => f.id === id))
          .filter((f): f is ClickUpField => f !== undefined)
        if (sectionFields.length === 0) return ''
        return `## ${s.title}\n\n${block(sectionFields, values)}`
      })
      .filter(Boolean)
      .join('\n\n')
  }

  return block(fields, values)
}
