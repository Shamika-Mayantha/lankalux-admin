'use client'

import { useState, useEffect } from 'react'
import { X, Send, MessageCircle } from 'lucide-react'
import type { ManagedImageItem } from '@/lib/managed-image'

export function ClientViewPreviewModal({
  open,
  onClose,
  includeItinerary,
  onItineraryImagesChange,
  itineraryUrl,
  previewOptionIndex,
  onSendEmail,
  onSendWhatsApp,
  sending,
  hasWhatsApp,
}: {
  open: boolean
  onClose: () => void
  includeItinerary: boolean
  onItineraryImagesChange?: (items: ManagedImageItem[]) => void
  itineraryUrl?: string
  previewOptionIndex?: number
  onSendEmail: () => void
  onSendWhatsApp: () => void
  sending: boolean
  hasWhatsApp: boolean
}) {
  const [editMode, setEditMode] = useState(false)
  useEffect(() => {
    if (!open) setEditMode(false)
  }, [open])
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const payload = event.data as { type?: string; optionIndex?: number; images?: string[] }
      if (payload?.type !== 'itinerary-images-updated') return
      if (previewOptionIndex != null && payload.optionIndex != null && payload.optionIndex !== previewOptionIndex) return
      if (!onItineraryImagesChange || !Array.isArray(payload.images)) return
      const next = payload.images
        .filter((src) => typeof src === 'string' && src.trim().length > 0)
        .map((src) => ({ src, type: src.startsWith('/uploads/') ? 'uploaded' as const : 'default' as const }))
      onItineraryImagesChange(next)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [onItineraryImagesChange, previewOptionIndex])
  if (!open) return null

  const iframeSrc = (() => {
    if (!itineraryUrl) return ''
    const sep = itineraryUrl.includes('?') ? '&' : '?'
    return `${itineraryUrl}${sep}edit=${editMode ? '1' : '0'}`
  })()

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
        <label className="inline-flex items-center gap-2 text-xs text-secondary">
          <span>Edit Mode</span>
          <input
            type="checkbox"
            checked={editMode}
            onChange={(e) => setEditMode(e.target.checked)}
            className="rounded border-accent text-accent-theme"
          />
        </label>
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
        {includeItinerary && itineraryUrl ? (
          <div className="max-w-5xl mx-auto space-y-4">
            <div className="rounded-2xl border border-stone-300 bg-white p-3 shadow-sm">
              <div className="flex items-center justify-between gap-3 mb-2">
                <p className="text-sm font-semibold text-stone-700">Exact client link preview</p>
                <a
                  href={itineraryUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-[#b8860b] underline underline-offset-2"
                >
                  Open full page
                </a>
              </div>
              <iframe
                src={iframeSrc}
                title="Client itinerary preview"
                className="w-full h-[68vh] rounded-xl border border-stone-200 bg-white"
              />
            </div>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto rounded-2xl border border-stone-300 bg-white p-6 text-sm text-stone-600">
            Enable "Include itinerary" and ensure a public link is available to preview the exact client page.
          </div>
        )}
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
