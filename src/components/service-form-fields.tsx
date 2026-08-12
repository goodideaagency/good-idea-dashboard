import type { ClickUpField } from '@/lib/clickup'
import type { FieldSection } from '@/lib/service-catalog'

const inputCls =
  'mt-1 w-full border border-[#e7e2d3] px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-900'

// Every field is required except checkboxes (an unchecked, optional box is
// meaningful -- forcing it checked would break e.g. "Rush this audit?") and
// file/attachment uploads, which stay optional per policy: never block
// submission on a file. Everything else must be filled in since there's no
// draft-saving yet -- an abandoned form means nothing was captured at all.
function FieldInput({ f }: { f: ClickUpField }) {
  if (f.type === 'checkbox') {
    return <input id={`field-${f.id}`} name={`field_${f.id}`} type="checkbox" className="mt-1 h-4 w-4" />
  }
  if (f.type === 'attachment') {
    return (
      <input id={`field-${f.id}`} name={`field_${f.id}`} type="file" className="mt-1 text-sm text-gray-700" />
    )
  }
  if (f.type === 'drop_down') {
    return (
      <select id={`field-${f.id}`} name={`field_${f.id}`} required className={inputCls}>
        <option value="">Select...</option>
        {f.options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    )
  }
  if (f.type === 'number') {
    return <input id={`field-${f.id}`} name={`field_${f.id}`} type="number" required className={inputCls} />
  }
  if (f.type === 'date') {
    return <input id={`field-${f.id}`} name={`field_${f.id}`} type="date" required className={inputCls} />
  }
  if (f.type === 'url') {
    return <input id={`field-${f.id}`} name={`field_${f.id}`} type="url" required className={inputCls} />
  }
  if (f.type === 'email') {
    return <input id={`field-${f.id}`} name={`field_${f.id}`} type="email" required className={inputCls} />
  }
  return <textarea id={`field-${f.id}`} name={`field_${f.id}`} rows={3} required className={inputCls} />
}

// "labels" is ClickUp's multi-select type -- rendered as a checkbox group
// (all sharing one field name, collected server-side via formData.getAll())
// rather than the single-control pattern the other types use. Left optional
// like single checkboxes, since HTML has no way to require "at least one of
// these checked."
function LabelsField({ f }: { f: ClickUpField }) {
  return (
    <fieldset>
      <legend className="block text-sm font-medium text-gray-700">{f.name}</legend>
      <div className="mt-1 space-y-1.5">
        {f.options.map((o) => (
          <label key={o.id} className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" name={`field_${f.id}`} value={o.id} className="h-4 w-4" />
            {o.name}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

function Field({ f }: { f: ClickUpField }) {
  if (f.type === 'labels') return <LabelsField f={f} />
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700" htmlFor={`field-${f.id}`}>
        {f.name}
      </label>
      <FieldInput f={f} />
    </div>
  )
}

// Renders a service's intake questions -- grouped under section headers when
// the service defines them (long forms, like managed services, read much
// better broken into related chunks than one flat list), or as a plain
// stacked list otherwise (one-time services, which only have a couple of
// questions and don't need grouping).
export function ServiceFormFields({
  fields,
  sections,
}: {
  fields: ClickUpField[]
  sections?: FieldSection[]
}) {
  if (!sections || sections.length === 0) {
    return (
      <div className="space-y-4">
        {fields.map((f) => (
          <Field key={f.id} f={f} />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {sections.map((section) => {
        const sectionFields = section.fieldIds
          .map((id) => fields.find((f) => f.id === id))
          .filter((f): f is ClickUpField => f !== undefined)
        if (sectionFields.length === 0) return null
        return (
          <div key={section.title}>
            <p className="text-xs font-mono uppercase tracking-wide text-gray-400">{section.title}</p>
            <div className="mt-3 space-y-4">
              {sectionFields.map((f) => (
                <Field key={f.id} f={f} />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
