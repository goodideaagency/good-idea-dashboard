export type FileRow = {
  id: string
  title: string
  url: string
  extension?: string | null
  thumbnail?: string | null
}

// Groups of extensions that share one icon/color, so the grid doesn't need a
// full file-type icon set -- just enough to visually distinguish the common
// cases from a generic document.
const EXT_STYLES: Record<string, { label: string; className: string }> = {
  pdf: { label: 'PDF', className: 'bg-red-50 text-red-700 ring-red-100' },
  doc: { label: 'DOC', className: 'bg-blue-50 text-blue-700 ring-blue-100' },
  docx: { label: 'DOC', className: 'bg-blue-50 text-blue-700 ring-blue-100' },
  xls: { label: 'XLS', className: 'bg-green-50 text-green-700 ring-green-100' },
  xlsx: { label: 'XLS', className: 'bg-green-50 text-green-700 ring-green-100' },
  csv: { label: 'CSV', className: 'bg-green-50 text-green-700 ring-green-100' },
  ppt: { label: 'PPT', className: 'bg-orange-50 text-orange-700 ring-orange-100' },
  pptx: { label: 'PPT', className: 'bg-orange-50 text-orange-700 ring-orange-100' },
  zip: { label: 'ZIP', className: 'bg-gray-100 text-gray-700 ring-gray-200' },
  mp4: { label: 'MP4', className: 'bg-purple-50 text-purple-700 ring-purple-100' },
  mov: { label: 'MOV', className: 'bg-purple-50 text-purple-700 ring-purple-100' },
}

function extensionStyle(extension: string | null | undefined) {
  const ext = extension?.toLowerCase() ?? ''
  return EXT_STYLES[ext] ?? { label: ext ? ext.slice(0, 4).toUpperCase() : 'FILE', className: 'bg-gray-100 text-gray-700 ring-gray-200' }
}

// The fixed-size (square) thumbnail-or-badge box, with no wrapping link --
// shared by FileTile (a real, already-uploaded attachment) and any
// not-yet-uploaded local preview, which needs the same visual but isn't
// clickable yet.
export function FileTileVisual({
  title,
  extension,
  thumbnail,
}: {
  title: string
  extension?: string | null
  thumbnail?: string | null
}) {
  const style = extensionStyle(extension)
  return (
    <div className="flex h-20 w-20 items-center justify-center overflow-hidden bg-white ring-1 ring-[#ece7d8] group-hover:ring-gray-400">
      {thumbnail ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={thumbnail} alt={title} className="h-full w-full object-cover" />
      ) : (
        <span className={`px-2 py-1 text-xs font-mono font-semibold ring-1 ${style.className}`}>
          {style.label}
        </span>
      )}
    </div>
  )
}

// A fixed-size (square) tile used anywhere files/attachments render as a
// grid: image attachments show their ClickUp-generated thumbnail, everything
// else shows a colored file-type badge -- same size either way so a mixed
// set of files still lines up cleanly instead of looking messy.
export function FileTile({ file }: { file: FileRow }) {
  return (
    <a
      href={file.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex flex-col items-center gap-1.5"
      title={file.title}
    >
      <FileTileVisual title={file.title} extension={file.extension} thumbnail={file.thumbnail} />
      <span className="w-20 truncate text-center text-xs text-gray-600 group-hover:text-gray-900">
        {file.title}
      </span>
    </a>
  )
}
