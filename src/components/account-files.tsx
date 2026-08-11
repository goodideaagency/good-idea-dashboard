'use client'

import { useRef, useState } from 'react'

type FileRow = {
  id: string
  name: string
  url: string
  size_bytes: number | null
  created_at: string
}

function formatSize(bytes: number | null) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function AccountFiles({
  accountId,
  initialFiles,
}: {
  accountId: string
  initialFiles: FileRow[]
}) {
  const [files, setFiles] = useState(initialFiles)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleUpload(fileList: File[]) {
    setError(null)
    setUploading(true)
    try {
      for (const file of fileList) {
        const form = new FormData()
        form.append('account_id', accountId)
        form.append('file', file)
        const res = await fetch('/api/uploads/file', { method: 'POST', body: form })
        if (!res.ok) throw new Error('Upload failed')
        const data = await res.json()
        setFiles((prev) => [data.file, ...prev])
      }
    } catch {
      setError('Could not upload one or more files.')
    } finally {
      setUploading(false)
    }
  }

  async function handleDelete(id: string) {
    setFiles((prev) => prev.filter((f) => f.id !== id))
    await fetch('/api/uploads/file', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
  }

  return (
    <div>
      {files.length === 0 ? (
        <p className="text-sm text-gray-400">No files yet.</p>
      ) : (
        <ul className="space-y-2">
          {files.map((f) => (
            <li
              key={f.id}
              className="flex items-center justify-between gap-3 bg-white p-3 ring-1 ring-[#ece7d8]"
            >
              <a
                href={f.url}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-0 truncate text-sm text-gray-900 underline underline-offset-2 hover:text-gray-600"
              >
                {f.name}
              </a>
              <div className="flex shrink-0 items-center gap-3">
                <span className="text-xs text-gray-400">{formatSize(f.size_bytes)}</span>
                <button
                  type="button"
                  onClick={() => handleDelete(f.id)}
                  className="text-xs text-red-600 hover:text-red-800"
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="border border-[#e7e2d3] px-3 py-1.5 text-sm text-gray-700 hover:bg-[#f6f1e4] disabled:opacity-50"
        >
          {uploading ? 'Uploading…' : '+ Add files'}
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            // Copy into a real array first -- e.target.files is a live
            // FileList, so clearing e.target.value right after would empty
            // it out from under us before the upload even starts.
            const files = Array.from(e.target.files ?? [])
            e.target.value = ''
            if (files.length > 0) handleUpload(files)
          }}
        />
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>
    </div>
  )
}
