'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Upload, ImageIcon, Trash2, RefreshCw, X, FolderOpen } from 'lucide-react'
import type { ManagedImageItem } from '@/lib/managed-image'

type Props = {
  items: ManagedImageItem[]
  onChange: (next: ManagedImageItem[]) => void
  requestId: string
  sectionLabel: string
  disabled?: boolean
}

export function ImageManager({ items, onChange, requestId, sectionLabel, disabled }: Props) {
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [libraryPaths, setLibraryPaths] = useState<string[]>([])
  const [libraryLoading, setLibraryLoading] = useState(false)
  const [replaceIdx, setReplaceIdx] = useState<number | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [dragFrom, setDragFrom] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)
  const [uploading, setUploading] = useState(false)
  const addInputRef = useRef<HTMLInputElement>(null)
  const replaceInputRef = useRef<HTMLInputElement>(null)

  const loadLibrary = useCallback(async () => {
    setLibraryLoading(true)
    try {
      const res = await fetch('/api/image-library')
      const data = await res.json()
      setLibraryPaths(Array.isArray(data.paths) ? data.paths : [])
    } catch {
      setLibraryPaths([])
    } finally {
      setLibraryLoading(false)
    }
  }, [])

  useEffect(() => {
    if (libraryOpen) loadLibrary()
  }, [libraryOpen, loadLibrary])

  const uploadFiles = async (files: FileList | File[], replaceIndex: number | null) => {
    const list = Array.from(files).filter((f) => f.type.startsWith('image/'))
    if (!list.length) return
    setUploading(true)
    try {
      for (const file of list) {
        const fd = new FormData()
        fd.append('file', file)
        fd.append('requestId', requestId)
        const res = await fetch('/api/upload-client-image', { method: 'POST', body: fd })
        const data = await res.json()
        if (!res.ok) {
          alert(data.error || 'Upload failed')
          break
        }
        const item: ManagedImageItem = { src: data.src, type: 'uploaded' }
        if (replaceIndex !== null) {
          const next = [...items]
          next[replaceIndex] = item
          onChange(next)
          setReplaceIdx(null)
          setPickerOpen(false)
        } else {
          onChange([...items, item])
        }
      }
    } finally {
      setUploading(false)
    }
  }

  const addFromLibrary = (srcPath: string) => {
    const item: ManagedImageItem = { src: srcPath, type: 'default' }
    if (replaceIdx !== null) {
      const next = [...items]
      next[replaceIdx] = item
      onChange(next)
      setReplaceIdx(null)
    } else {
      onChange([...items, item])
    }
    setLibraryOpen(false)
    setPickerOpen(false)
  }

  const removeAt = (i: number) => {
    onChange(items.filter((_, j) => j !== i))
    if (replaceIdx === i) setReplaceIdx(null)
  }

  const onDragStart = (i: number) => {
    if (disabled) return
    setDragFrom(i)
  }

  const onDragOverSlot = (e: React.DragEvent, i: number) => {
    e.preventDefault()
    if (dragFrom === null) return
    setDragOver(i)
  }

  const onDropOn = (e: React.DragEvent, toIndex: number) => {
    e.preventDefault()
    if (dragFrom === null || disabled) {
      setDragFrom(null)
      setDragOver(null)
      return
    }
    const from = dragFrom
    if (from === toIndex && toIndex < items.length) {
      setDragFrom(null)
      setDragOver(null)
      return
    }
    const next = [...items]
    const [removed] = next.splice(from, 1)
    if (toIndex >= next.length) {
      next.push(removed)
    } else {
      let pos = toIndex
      if (from < toIndex) pos = toIndex - 1
      next.splice(pos, 0, removed)
    }
    onChange(next)
    setDragFrom(null)
    setDragOver(null)
  }

  const onDragEnd = () => {
    setDragFrom(null)
    setDragOver(null)
  }

  const openReplace = (i: number) => {
    setReplaceIdx(i)
    setPickerOpen(true)
  }

  return (
    <div className={`space-y-3 ${disabled ? 'opacity-60 pointer-events-none' : ''}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-[#d4af37]/90">{sectionLabel}</span>
        {items.length > 0 && (
          <span className="text-[10px] text-zinc-500">{items.length} image{items.length !== 1 ? 's' : ''}</span>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {items.map((item, i) => {
          const isDragging = dragFrom === i
          const isOver = dragOver === i && dragFrom !== null && dragFrom !== i
          return (
            <div
              key={`${item.src}-${i}`}
              draggable={!disabled}
              onDragStart={() => onDragStart(i)}
              onDragOver={(e) => onDragOverSlot(e, i)}
              onDrop={(e) => onDropOn(e, i)}
              onDragEnd={onDragEnd}
              className={`group relative aspect-[4/3] rounded-2xl overflow-hidden border-2 transition-all duration-300 ${
                isDragging
                  ? 'scale-95 opacity-70 shadow-2xl shadow-black/50 z-20 ring-2 ring-[#d4af37]'
                  : isOver
                    ? 'ring-2 ring-[#d4af37] ring-offset-2 ring-offset-zinc-900 scale-[1.02]'
                    : 'border-zinc-700 hover:border-[#d4af37]/50 shadow-lg hover:shadow-xl'
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.src}
                alt=""
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <button
                type="button"
                onClick={() => removeAt(i)}
                className="absolute top-2 right-2 p-1.5 rounded-xl bg-red-950/90 text-red-200 hover:bg-red-800 opacity-0 group-hover:opacity-100 transition-all duration-200 shadow-lg"
                aria-label="Remove"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => openReplace(i)}
                className="absolute bottom-2 left-2 right-2 py-2 rounded-xl bg-black/75 text-[#d4af37] text-xs font-semibold flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-all duration-200 border border-[#d4af37]/30"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Replace
              </button>
              <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-black/60 text-zinc-300">
                {item.type === 'default' ? 'Library' : 'Upload'}
              </span>
            </div>
          )
        })}

      </div>

      {dragFrom !== null && items.length > 0 && (
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(items.length)
          }}
          onDrop={(e) => onDropOn(e, items.length)}
          className={`h-14 rounded-2xl border-2 border-dashed flex items-center justify-center text-sm font-medium transition-all duration-200 ${
            dragOver === items.length
              ? 'border-[#d4af37] bg-[#d4af37]/15 text-[#d4af37]'
              : 'border-zinc-700 text-zinc-500'
          }`}
        >
          Drop at end of gallery
        </div>
      )}

      <div
        onDragOver={(e) => {
          e.preventDefault()
          if (dragFrom !== null) setDragOver(items.length)
        }}
        onDrop={(e) => {
          if (dragFrom !== null) onDropOn(e, items.length)
          else {
            e.preventDefault()
            const f = e.dataTransfer.files
            if (f?.length) void uploadFiles(f, null)
          }
        }}
        className={`rounded-2xl border-2 border-dashed transition-all duration-300 px-6 py-8 text-center ${
          uploading ? 'border-[#d4af37] bg-[#d4af37]/10' : 'border-zinc-600 bg-zinc-900/40 hover:border-[#d4af37]/40'
        }`}
      >
        <input
          ref={addInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) void uploadFiles(e.target.files, null)
            e.target.value = ''
          }}
        />
        <Upload className="w-8 h-8 mx-auto text-[#d4af37]/80 mb-2" />
        <p className="text-zinc-400 text-sm mb-3">Drag & drop images here or</p>
        <div className="flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={() => addInputRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#d4af37] text-black text-sm font-semibold hover:bg-[#e8c96b] transition-colors duration-200 disabled:opacity-50"
          >
            <Upload className="w-4 h-4" />
            {uploading ? 'Uploading…' : 'Upload'}
          </button>
          <button
            type="button"
            onClick={() => setLibraryOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-[#d4af37]/50 text-[#d4af37] text-sm font-semibold hover:bg-[#d4af37]/10 transition-colors duration-200"
          >
            <FolderOpen className="w-4 h-4" />
            Add from library
          </button>
        </div>
      </div>

      {/* Library modal */}
      {libraryOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          onClick={() => setLibraryOpen(false)}
        >
          <div
            className="bg-[#141210] border border-zinc-700 rounded-2xl max-w-3xl w-full max-h-[85vh] flex flex-col shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
              <h3 className="text-lg font-semibold text-[#d4af37] flex items-center gap-2">
                <ImageIcon className="w-5 h-5" />
                Image library — /public/images
              </h3>
              <button type="button" onClick={() => setLibraryOpen(false)} className="p-2 rounded-lg text-zinc-400 hover:bg-zinc-800">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-1">
              {libraryLoading ? (
                <p className="text-zinc-500 text-center py-12">Loading…</p>
              ) : libraryPaths.length === 0 ? (
                <p className="text-zinc-500 text-center py-12">Add images under <code className="text-[#d4af37]">public/images</code></p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {libraryPaths.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => addFromLibrary(p)}
                      className="aspect-square rounded-xl overflow-hidden border-2 border-zinc-700 hover:border-[#d4af37] transition-all duration-200 hover:scale-[1.03] hover:shadow-lg hover:shadow-[#d4af37]/10"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p} alt="" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Replace picker: upload vs library */}
      {pickerOpen && replaceIdx !== null && (
        <div
          className="fixed inset-0 z-[75] flex items-center justify-center p-4 bg-black/80"
          onClick={() => {
            setPickerOpen(false)
            setReplaceIdx(null)
          }}
        >
          <div
            className="bg-[#1a1816] border border-[#d4af37]/30 rounded-2xl p-6 max-w-sm w-full shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h4 className="text-[#d4af37] font-semibold mb-4">Replace image</h4>
            <input
              ref={replaceInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) void uploadFiles(e.target.files, replaceIdx)
                e.target.value = ''
              }}
            />
            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={() => replaceInputRef.current?.click()}
                className="flex items-center justify-center gap-2 py-3 rounded-xl bg-[#d4af37] text-black font-semibold"
              >
                <Upload className="w-4 h-4" />
                Upload new
              </button>
              <button
                type="button"
                onClick={() => {
                  setPickerOpen(false)
                  setLibraryOpen(true)
                }}
                className="flex items-center justify-center gap-2 py-3 rounded-xl border border-[#d4af37]/50 text-[#d4af37] font-semibold"
              >
                <FolderOpen className="w-4 h-4" />
                Choose from library
              </button>
              <button
                type="button"
                onClick={() => {
                  setPickerOpen(false)
                  setReplaceIdx(null)
                }}
                className="text-zinc-500 text-sm py-2"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
