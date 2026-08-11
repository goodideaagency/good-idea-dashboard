'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

// A small "attach a file" control next to a task's comment box. Uploads
// straight to ClickUp (see /api/uploads/task-file) and posts an attributed
// comment there, then refreshes so the new attachment/comment show up in
// this server-rendered view.
export function TaskFileUpload({ accountId, taskId }: { accountId: string; taskId: string }) {
  const router = useRouter()
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    setError(null)
    setUploading(true)
    try {
      const form = new FormData()
      form.append('account_id', accountId)
      form.append('task_id', taskId)
      form.append('file', file)
      const res = await fetch('/api/uploads/task-file', { method: 'POST', body: form })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error ?? 'Upload failed')
      }
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not upload that file.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="text-xs text-gray-500 underline underline-offset-2 hover:text-gray-800 disabled:opacity-50"
      >
        {uploading ? 'Uploading…' : '+ Attach a file'}
      </button>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) handleFile(file)
        }}
      />
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  )
}
