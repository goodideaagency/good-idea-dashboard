import type { ClickUpField } from '@/lib/clickup'
import type { FieldSection } from '@/lib/service-catalog'

const inputCls =
  'mt-1 w-full border border-[#e7e2d3] px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-900'

function FieldInput({ f }: { f: ClickUpField }) {
  if (f.type === 'checkbox') {
    return <input id={`field-${f.id}`} name={`field_${f.id}`} type="checkbox" className="mt-1 h-4 w-4" />
  }
  if (f.type === 'drop_down') {
    return (
      <select id={`field-${f.id}`} name={`field_${f.id}`} className={inputCls}>
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
    return <input id={`field-${f.id}`} name={`field_${f.id}`} type="number" className={inputCls} />
  }
  if (f.type === 'date') {
    return <input id={`field-${f.id}`} name={`field_${f.id}`} type="date" className={inputCls} />
  }
  if (f.type === 'url') {
    return <input id={`field-${f.id}`} name={`field_${f.id}`} type="url" className={inputCls} />
  }
  if (f.type === 'email') {
    return <input id={`field-${f.id}`} name={`field_${f.id}`} type="email" className={inputCls} />
  }
  return <textarea id={`field-${f.id}`} name={`field_${f.id}`} rows={3} className={inputCls} />
}

function Field({ f }: { f: ClickUpField }) {
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
