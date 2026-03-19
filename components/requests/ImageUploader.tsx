'use client'

import { useCallback, useRef, useState } from 'react'
import { GripVertical, Trash2, Upload } from 'lucide-react'
import { supabase } from '@/lib/supabase'

export function ImageUploader({
  requestId,
  images,
  onChange,
  maxImages = 8,
}: {
  requestId: string
  images: string[]
  onChange: (urls: string[]) => void
  maxImages?: number
}) {
  const [dragOver, setDragOver] = useState(false)
  const [dragReorder, setDragReorder] = useState<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const uploadFile = async (file: File): Promise<string | null> => {
    const ext = file.name.split('.').pop()?.replace(/[^a-z0-9]/gi, '') || 'jpg'
    const path = `${requestId}/${crypto.randomUUID()}.${ext}`
    try {
      const { data: session } = await supabase.auth.getSession()
      if (!session.session) {
        const reader = new FileReader()
        return await new Promise((resolve) => {
          reader.onload = () => resolve(reader.result as string)
          reader.onerror = () => resolve(null)
          reader.readAsDataURL(file)
        })
      }
      const { error } = await supabase.storage.from('hotel-images').upload(path, file, {
        cacheControl: '3600',
        upsert: false,
      })
      if (error) {
        console.warn('Storage upload failed, using data URL:', error.message)
        const reader = new FileReader()
        return await new Promise((resolve) => {
          reader.onload = () => resolve(reader.result as string)
          reader.onerror = () => resolve(null)
          reader.readAsDataURL(file)
        })
      }
      const { data: pub } = supabase.storage.from('hotel-images').getPublicUrl(path)
      return pub.publicUrl
    } catch {
      return null
    }
  }

  const addFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files).filter((f) => f.type.startsWith('image/'))
      const room = maxImages - images.length
      const take = list.slice(0, Math.max(0, room))
      const next = [...images]
      for (const file of take) {
        const url = await uploadFile(file)
        if (url) next.push(url)
      }
      onChange(next)
    },
    [images, maxImages, onChange, requestId]
  )

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files?.length) void addFiles(e.dataTransfer.files)
  }

  const reorder = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0) return
    const next = [...images]
    const [removed] = next.splice(from, 1)
    next.splice(to, 0, removed)
    onChange(next)
  }

  return (
    <div className="space-y-3">
      <label className="text-xs uppercase tracking-wider text-zinc-500">Images (drag to reorder)</label>
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`relative rounded-2xl border-2 border-dashed transition-all duration-200 ${
          dragOver
            ? 'border-[#d4af37] bg-[#d4af37]/10 scale-[1.01]'
            : 'border-zinc-600 bg-zinc-900/50 hover:border-zinc-500'
        } p-8 text-center`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) void addFiles(e.target.files)
            e.target.value = ''
          }}
        />
        <Upload className="w-10 h-10 mx-auto text-[#d4af37]/70 mb-3" />
        <p className="text-zinc-400 text-sm mb-2">Drop images here or click to browse</p>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={images.length >= maxImages}
          className="text-sm font-medium text-[#d4af37] hover:text-[#e8c96b] disabled:opacity-40"
        >
          Choose files
        </button>
        {images.length >= maxImages && (
          <p className="text-xs text-amber-600/80 mt-2">Maximum {maxImages} images</p>
        )}
      </div>

      {images.length > 0 && (
        <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {images.map((url, i) => (
            <li
              key={`${url.slice(0, 48)}-${i}`}
              draggable
              onDragStart={() => setDragReorder(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                if (dragReorder !== null) reorder(dragReorder, i)
                setDragReorder(null)
              }}
              onDragEnd={() => setDragReorder(null)}
              className={`group relative aspect-[4/3] rounded-xl overflow-hidden border border-zinc-700 bg-zinc-900 shadow-md transition-transform hover:scale-[1.02] hover:shadow-lg hover:shadow-[#d4af37]/10 ${
                dragReorder === i ? 'ring-2 ring-[#d4af37] scale-95' : ''
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="w-full h-full object-cover" />
              <div className="absolute top-1 left-1 p-1 rounded bg-black/50 text-zinc-300 cursor-grab active:cursor-grabbing">
                <GripVertical className="w-4 h-4" />
              </div>
              <button
                type="button"
                onClick={() => onChange(images.filter((_, j) => j !== i))}
                className="absolute top-1 right-1 p-1.5 rounded-lg bg-red-900/90 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-700"
                aria-label="Remove image"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
