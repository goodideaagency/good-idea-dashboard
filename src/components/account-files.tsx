'use client'

import { useRef, useState } from 'react'
import { FileTile, type FileRow } from './file-tile'

export function AccountFiles({
  accountId,
  initialFiles,
  canUpload,
}: {
  accountId: string
  initialFiles: FileRow[]
  canUpload: boolean
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
        if (!res.ok) {
          const data = await res.json().catch(() => null)
          throw new Error(data?.error ?? 'Upload failed')
        }
        const data = await res.json()
        setFiles((prev) => [data.file, ...prev])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not upload one or more files.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div>
      {files.length === 0 ? (
        <p className="text-sm text-gray-400">No files yet.</p>
      ) : (
        <div className="flex flex-wrap gap-4">
          {files.map((f) => (
            <FileTile key={f.id} file={f} />
          ))}
        </div>
      )}

      {canUpload ? (
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
              const selected = Array.from(e.target.files ?? [])
              e.target.value = ''
              if (selected.length > 0) handleUpload(selected)
            }}
          />
          {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
          <p className="mt-1 text-xs text-gray-400">
            Files are attached directly to this client&apos;s profile in ClickUp. To remove one, ask
            your Good Idea team to delete it there.
          </p>
        </div>
      ) : (
        error && <p className="mt-3 text-xs text-red-600">{error}</p>
      )}
    </div>
  )
}
