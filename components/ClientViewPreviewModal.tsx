'use client'

import { useState, useEffect } from 'react'
import { X, Send, MessageCircle } from 'lucide-react'
import type { ManagedImageItem } from '@/lib/managed-image'
import { normalizeManagedImages } from '@/lib/managed-image'
import { ItineraryRender } from '@/components/itinerary/ItineraryRender'
import type { RenderItinerary } from '@/components/itinerary/ItineraryRender'
import type { ItineraryOption } from '@/components/requests/itinerary-types'
import type { HotelRecord } from '@/lib/hotel-types'

export function ClientViewPreviewModal({
  open,
  onClose,
  clientName,
  includeItinerary,
  defaultItineraryImages = [],
  requestId,
  itineraryOption,
  includeHotel,
  hotel,
  startDate,
  endDate,
  duration,
  vehicle,
  price,
  onItineraryImagesChange,
  onItineraryContentChange,
  savingImages = false,
  onSendEmail,
  onSendWhatsApp,
  sending,
  hasWhatsApp,
}: {
  open: boolean
  onClose: () => void
  clientName: string
  includeItinerary: boolean
  itineraryOption?: ItineraryOption | null
  includeHotel?: boolean
  hotel?: HotelRecord | null
  startDate?: string | null
  endDate?: string | null
  duration?: number | null
  vehicle?: { name: string; description: string; images: string[] } | null
  price?: string | null
  onItineraryImagesChange?: (items: ManagedImageItem[]) => void
  onItineraryContentChange?: (next: ItineraryOption) => Promise<void>
  defaultItineraryImages?: ManagedImageItem[]
  requestId?: string
  savingImages?: boolean
  onSendEmail: () => void
  onSendWhatsApp: () => void
  sending: boolean
  hasWhatsApp: boolean
}) {
  const [editMode, setEditMode] = useState(false)
  const [images, setImages] = useState<string[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerMode, setPickerMode] = useState<'replace' | 'add'>('replace')
  const [targetIndex, setTargetIndex] = useState<number>(0)
  const [libraryPaths, setLibraryPaths] = useState<string[]>([])
  const [dragOverUpload, setDragOverUpload] = useState(false)
  const [itineraryDraft, setItineraryDraft] = useState<RenderItinerary | null>(null)
  const [savingContent, setSavingContent] = useState(false)
  const [contentDirty, setContentDirty] = useState(false)
  useEffect(() => {
    if (!open) {
      setEditMode(false)
      setPickerOpen(false)
      setSavingContent(false)
      setContentDirty(false)
    }
  }, [open])
  useEffect(() => {
    if (!itineraryOption) {
      setImages([])
      return
    }
    const d = Array.isArray(itineraryOption.days)
      ? itineraryOption.days.map((x) => (x as { image?: string }).image || '').filter(Boolean)
      : []
    if (d.length > 0) {
      setImages(d)
      return
    }
    const existing = normalizeManagedImages((itineraryOption as { images?: unknown }).images).map((i) => i.src)
    setImages(existing.slice(1))
  }, [itineraryOption?.title, open])

  useEffect(() => {
    if (!itineraryOption || !open) {
      setItineraryDraft(null)
      setContentDirty(false)
      return
    }
    const normalizedDays = Array.isArray(itineraryOption.days)
      ? itineraryOption.days
      : [{ day: 1, title: 'Itinerary', location: '', activities: [String(itineraryOption.days || '')] }]
    setItineraryDraft({
      title: itineraryOption.title || '',
      summary: itineraryOption.summary || '',
      days: normalizedDays.map((d, i) => ({
        day: d.day ?? i + 1,
        title: d.title || '',
        location: d.location || '',
        activities: Array.isArray(d.activities) ? d.activities : [],
        optional_activities: Array.isArray((d as { optional_activities?: string[] }).optional_activities)
          ? (d as { optional_activities?: string[] }).optional_activities
          : [],
        what_to_expect: (d as { what_to_expect?: string }).what_to_expect || '',
        image: (d as { image?: string }).image,
      })),
    })
    setContentDirty(false)
  }, [itineraryOption, open])

  const persist = (next: string[]) => {
    setImages(next)
    if (!onItineraryImagesChange) return
    const hero = normalizeManagedImages(defaultItineraryImages)[0]?.src || next[0] || '/images/placeholder.jpg'
    const items: ManagedImageItem[] = [hero, ...next].map((src) => ({
      src,
      type: src.startsWith('/uploads/') || src.includes('/storage/v1/object/public/') ? 'uploaded' : 'default',
    }))
    onItineraryImagesChange(items)
  }

  const openPicker = async (mode: 'replace' | 'add', index: number) => {
    setPickerMode(mode)
    setTargetIndex(index)
    setPickerOpen(true)
    try {
      const res = await fetch('/api/image-library')
      const data = await res.json()
      setLibraryPaths(Array.isArray(data.paths) ? data.paths : [])
    } catch {
      setLibraryPaths([])
    }
  }

  const applyImage = (src: string) => {
    const updated = [...images]
    if (pickerMode === 'replace') {
      updated[targetIndex] = src
    } else {
      updated.splice(targetIndex, 0, src)
    }
    persist(updated.filter(Boolean))
    setPickerOpen(false)
  }

  const uploadAndApply = async (file?: File) => {
    if (!file || !requestId) return
    const fd = new FormData()
    fd.append('file', file)
    fd.append('requestId', requestId)
    const res = await fetch('/api/upload-client-image', { method: 'POST', body: fd })
    const data = await res.json()
    if (!res.ok || !data?.src) {
      alert(data?.error || 'Upload failed')
      return
    }
    applyImage(String(data.src))
  }

  const saveContentChanges = async () => {
    if (!onItineraryContentChange || !itineraryOption || !itineraryDraft || !contentDirty) return
    setSavingContent(true)
    try {
      await onItineraryContentChange({
        ...itineraryOption,
        title: itineraryDraft.title.trim(),
        summary: itineraryDraft.summary.trim(),
        days: itineraryDraft.days.map((d, i) => ({
          ...d,
          day: d.day || i + 1,
          title: (d.title || '').trim() || `Day ${d.day || i + 1}`,
          location: (d.location || '').trim(),
          activities: (d.activities || []).map((a) => (a || '').trim()).filter(Boolean),
          what_to_expect: (d.what_to_expect || '').trim(),
        })),
      })
      setContentDirty(false)
    } catch (e) {
      console.error(e)
      alert('Could not save itinerary text changes.')
    } finally {
      setSavingContent(false)
    }
  }
  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col transition-colors duration-200"
      style={{ backgroundColor: 'var(--bg-page)', color: 'var(--text-primary)' }}
    >
      <div
        className="shrink-0 flex items-center justify-between px-4 py-3 border-b transition-colors duration-200"
        style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-card)' }}
      >
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em]" style={{ color: 'var(--accent-gold)' }}>
            Client view
          </p>
          <p className="text-sm opacity-80">Exactly as structured for your client</p>
        </div>
        <div className="flex items-center gap-3">
          {editMode ? (
            <button
              type="button"
              onClick={() => void saveContentChanges()}
              disabled={!contentDirty || savingContent}
              className="px-3 py-1.5 text-xs rounded-md bg-[#d4af37] text-black font-semibold disabled:opacity-50"
            >
              {savingContent ? 'Saving...' : contentDirty ? 'Save text changes' : 'Saved'}
            </button>
          ) : null}
          <label className="inline-flex items-center gap-2 text-xs text-secondary">
            <span>Edit Mode</span>
            <input
              type="checkbox"
              checked={editMode}
              onChange={(e) => setEditMode(e.target.checked)}
              className="rounded border-accent text-accent-theme"
            />
          </label>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-2 rounded-xl opacity-70 hover:opacity-100 transition-opacity"
          style={{ backgroundColor: 'var(--bg-input)' }}
          aria-label="Close"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="max-w-5xl mx-auto space-y-4">
          {includeItinerary && itineraryOption ? (
            <>
              <ItineraryRender
                mode="preview"
                clientName={clientName}
                startDate={startDate}
                endDate={endDate}
                duration={duration}
                itinerary={
                  itineraryDraft || {
                    title: itineraryOption.title,
                    summary: itineraryOption.summary,
                    days: Array.isArray(itineraryOption.days)
                      ? itineraryOption.days
                      : [{ day: 1, title: 'Itinerary', location: '', activities: [String(itineraryOption.days || '')] }],
                  }
                }
                hotel={includeHotel ? hotel : null}
                vehicle={vehicle ?? null}
                price={price ?? null}
                images={images}
                editable={editMode}
                onItineraryChange={(next) => {
                  setItineraryDraft(next)
                  setContentDirty(true)
                }}
                onReplace={(index) => void openPicker('replace', index)}
                onRemove={(index) => {
                  const updated = images.filter((_, i) => i !== index)
                  persist(updated)
                }}
                onAdd={() => void openPicker('add', images.length)}
                onReorder={(from, to) => {
                  if (from === to) return
                  const updated = [...images]
                  const [m] = updated.splice(from, 1)
                  updated.splice(to, 0, m)
                  persist(updated)
                }}
              />
              {editMode && pickerOpen ? (
                <div
                  className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-black/40"
                  onClick={() => setPickerOpen(false)}
                >
                  <div
                    className="w-full max-w-4xl rounded-2xl shadow-2xl border border-stone-300 p-4 md:p-5"
                    style={{ backgroundColor: 'var(--bg-card)' }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
                        {pickerMode === 'replace' ? 'Replace Image' : 'Add Image'}
                      </h3>
                      <button
                        type="button"
                        onClick={() => setPickerOpen(false)}
                        className="px-3 py-1.5 text-sm rounded-md border border-stone-300 hover:bg-stone-100"
                      >
                        Cancel
                      </button>
                    </div>

                    <div className="flex flex-wrap gap-2 mb-4">
                      <label className="px-3 py-2 text-sm rounded-md border border-stone-300 bg-white hover:bg-stone-100 cursor-pointer">
                        Upload Image
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={async (e) => {
                            const file = e.target.files?.[0]
                            e.currentTarget.value = ''
                            await uploadAndApply(file)
                          }}
                        />
                      </label>
                      {pickerMode === 'replace' ? (
                        <button
                          type="button"
                          onClick={() => {
                            const updated = images.filter((_, i) => i !== targetIndex)
                            persist(updated)
                            setPickerOpen(false)
                          }}
                          className="px-3 py-2 text-sm rounded-md bg-red-600 text-white hover:bg-red-700"
                        >
                          Remove Image
                        </button>
                      ) : null}
                    </div>

                    <div
                      className={`mb-4 rounded-xl border-2 border-dashed p-4 text-sm text-center transition-colors ${
                        dragOverUpload ? 'border-[#c8a45d] bg-[#faf3df]' : 'border-stone-300'
                      }`}
                      onDragOver={(e) => {
                        e.preventDefault()
                        setDragOverUpload(true)
                      }}
                      onDragLeave={() => setDragOverUpload(false)}
                      onDrop={async (e) => {
                        e.preventDefault()
                        setDragOverUpload(false)
                        const file = e.dataTransfer.files?.[0]
                        await uploadAndApply(file)
                      }}
                    >
                      Drag & drop an image here, or use Upload Image
                    </div>

                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 max-h-[44vh] overflow-y-auto pr-1">
                      {libraryPaths.map((src) => (
                        <button
                          key={src}
                          type="button"
                          onClick={() => applyImage(src)}
                          className="rounded-xl overflow-hidden border border-stone-200 hover:ring-2 hover:ring-[#c8a45d] transition-transform duration-200 hover:scale-[1.02]"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={src} alt="" className="w-full h-20 object-cover" />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <div className="max-w-2xl mx-auto rounded-2xl border border-stone-300 bg-white p-6 text-sm text-stone-600">
              Generate or select an itinerary to preview.
            </div>
          )}
        </div>
      </div>

      <div
        className="shrink-0 border-t px-4 py-4 safe-area-pb transition-colors duration-200"
        style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-card)' }}
      >
        <div className="max-w-2xl mx-auto flex flex-wrap gap-2 justify-center">
          <button type="button" onClick={onClose} className="btn-secondary-theme px-5 py-3 rounded-xl text-sm">
            Back to edit
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-3 rounded-xl text-sm opacity-70 hover:opacity-100 transition-opacity"
            style={{ color: 'var(--text-secondary)' }}
          >
            Close
          </button>
          <button
            type="button"
            onClick={onSendEmail}
            disabled={sending}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#d4af37] text-black font-semibold hover:bg-[#e8c96b] transition-colors duration-200 disabled:opacity-50 shadow-lg shadow-[#d4af37]/20"
          >
            {sending ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-black border-t-transparent" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            Send now
          </button>
          {hasWhatsApp && (
            <button
              type="button"
              onClick={onSendWhatsApp}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#25D366] text-white font-semibold hover:bg-[#20bd5a] transition-colors duration-200"
            >
              <MessageCircle className="w-4 h-4" />
              Send via WhatsApp
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
