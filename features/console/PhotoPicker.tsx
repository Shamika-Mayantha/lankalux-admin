'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { consoleFetch } from '@/lib/console-api'

export function PhotoPicker({
  value,
  images,
  onChange,
}: {
  value: string
  images: string[]
  onChange: (src: string) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploaded, setUploaded] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)

  useEffect(() => {
    let cancelled = false
    consoleFetch('/api/v2/photos')
      .then((json) => {
        if (cancelled) return
        setUploaded(Array.isArray(json.paths) ? json.paths.filter((src: unknown) => typeof src === 'string') : [])
      })
      .catch(() => {
        if (!cancelled) setUploaded([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  const allImages = useMemo(() => {
    const seen = new Set<string>()
    const out: string[] = []
    for (const src of [...uploaded, ...images, value]) {
      if (!src || seen.has(src)) continue
      seen.add(src)
      out.push(src)
    }
    return out
  }, [uploaded, images, value])

  async function uploadFiles(files: FileList | File[]) {
    const list = Array.from(files).filter((file) => file.type.startsWith('image/'))
    if (!list.length) {
      setError('Choose an image file (JPG, PNG, WebP, or GIF).')
      return
    }
    setBusy(true)
    setError(null)
    try {
      let lastSrc = ''
      for (const file of list) {
        const fd = new FormData()
        fd.append('file', file)
        const json = await consoleFetch('/api/v2/photos', { method: 'POST', body: fd })
        const src = typeof json.src === 'string' ? json.src : ''
        if (!src) throw new Error('Upload did not return an image URL.')
        lastSrc = src
        setUploaded((prev) => [src, ...prev.filter((item) => item !== src)])
      }
      if (lastSrc) onChange(lastSrc)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="ll-row" style={{ marginBottom: 8, justifyContent: 'space-between' }}>
        <p className="ll-muted" style={{ margin: 0 }}>
          Library photos, or upload from this computer.
        </p>
        <button
          type="button"
          className="ll-btn secondary"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? 'Uploading…' : 'Upload photo'}
        </button>
      </div>
      {error ? <div className="ll-error">{error}</div> : null}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="ll-file-hidden"
        onChange={(e) => {
          if (e.target.files?.length) void uploadFiles(e.target.files)
          e.target.value = ''
        }}
      />
      <div
        className={`ll-photos ${dragOver ? 'is-drop' : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          if (e.dataTransfer.files?.length) void uploadFiles(e.dataTransfer.files)
        }}
      >
        <button
          type="button"
          className={`ll-photo-tile ll-photo-none ${!value ? 'is-on' : ''}`}
          onClick={() => onChange('')}
          aria-label="No photograph"
        />
        {allImages.map((src) => (
          <button
            key={src}
            type="button"
            className={`ll-photo-tile ${value === src ? 'is-on' : ''}`}
            onClick={() => onChange(src)}
            aria-pressed={value === src}
          >
            <img src={src} alt="" />
          </button>
        ))}
      </div>
    </div>
  )
}
