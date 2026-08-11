'use client'

import { useRef, useState } from 'react'

// Center-crops an image to a square client-side so we never have to store
// or reason about arbitrary aspect ratios -- takes the largest square that
// fits, centered on the image.
async function cropToSquare(file: File): Promise<Blob> {
  const objectUrl = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve(image)
      image.onerror = () => reject(new Error('Could not read image'))
      image.src = objectUrl
    })

    const size = Math.min(img.width, img.height)
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas unsupported')
    ctx.drawImage(img, (img.width - size) / 2, (img.height - size) / 2, size, size, 0, 0, size, size)

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Crop failed'))), 'image/png', 0.92)
    })
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

export function LogoUploader({
  accountId,
  currentUrl,
}: {
  accountId: string
  currentUrl: string | null
}) {
  const [preview, setPreview] = useState(currentUrl)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    setError(null)
    setUploading(true)
    try {
      const cropped = await cropToSquare(file)
      const form = new FormData()
      form.append('account_id', accountId)
      form.append('file', cropped, 'logo.png')
      const res = await fetch('/api/uploads/logo', { method: 'POST', body: form })
      if (!res.ok) throw new Error('Upload failed')
      const data = await res.json()
      setPreview(data.url)
    } catch {
      setError('Could not upload that image. Try a different file.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div>
      <p className="text-sm font-medium text-gray-700">Logo</p>
      <div className="mt-1 flex items-center gap-4">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt=""
            className="h-20 w-20 shrink-0 rounded object-cover ring-1 ring-[#e7e2d3]"
          />
        ) : (
          <div className="flex h-20 w-20 shrink-0 items-center justify-center bg-[#f6f1e4] text-xs text-gray-400 ring-1 ring-[#e7e2d3]">
            No logo
          </div>
        )}
        <div>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="border border-[#e7e2d3] px-3 py-1.5 text-sm text-gray-700 hover:bg-[#f6f1e4] disabled:opacity-50"
          >
            {uploading ? 'Uploading…' : preview ? 'Change logo' : 'Upload logo'}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) handleFile(file)
            }}
          />
          <p className="mt-1 text-xs text-gray-400">Automatically cropped to a square.</p>
          {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
        </div>
      </div>
    </div>
  )
}
