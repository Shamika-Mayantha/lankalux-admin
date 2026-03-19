'use client'

import { useState, useEffect } from 'react'
import { X, Send, MessageCircle, ImageIcon, RotateCcw } from 'lucide-react'
import type { ManagedImageItem } from '@/lib/managed-image'
import { imageSrcs, normalizeManagedImages } from '@/lib/managed-image'
import type { ItineraryOption } from '@/components/requests/itinerary-types'
import type { HotelRecord } from '@/lib/hotel-types'
import { ImageManager } from '@/components/ImageManager'

function DayBlock({
  day,
  imageAfter,
}: {
  day: { day: number; title: string; location: string; activities?: string[] }
  imageAfter?: string
}) {
  return (
    <div className="mb-8 pb-8 border-b border-stone-200 last:border-0">
      <p className="text-[#b8860b] font-bold text-lg mb-1">
        Day {day.day}: {day.title}
      </p>
      <p className="text-stone-600 text-sm mb-3">{day.location}</p>
      <ul className="list-disc pl-5 space-y-1 text-stone-700 text-sm">
        {(day.activities || []).map((a, i) => (
          <li key={i}>{a}</li>
        ))}
      </ul>
      {imageAfter && (
        <div className="mt-5 rounded-2xl overflow-hidden shadow-lg ring-1 ring-stone-200/80">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageAfter} alt="" className="w-full max-h-64 object-cover hover:scale-[1.02] transition-transform duration-300" />
        </div>
      )}
    </div>
  )
}

export function ClientViewPreviewModal({
  open,
  onClose,
  clientName,
  includeItinerary,
  includeHotel,
  itineraryOption,
  hotel,
  defaultItineraryImages = [],
  onItineraryImagesChange,
  requestId,
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
  includeHotel: boolean
  itineraryOption: ItineraryOption | null
  hotel: HotelRecord | null
  defaultItineraryImages?: ManagedImageItem[]
  onItineraryImagesChange?: (items: ManagedImageItem[]) => void
  requestId?: string
  savingImages?: boolean
  onSendEmail: () => void
  onSendWhatsApp: () => void
  sending: boolean
  hasWhatsApp: boolean
}) {
  const [showImageEditor, setShowImageEditor] = useState(false)
  useEffect(() => {
    if (!open) setShowImageEditor(false)
  }, [open])
  if (!open) return null

  const opt = itineraryOption
  const itineraryImages = opt ? normalizeManagedImages((opt as { images?: unknown }).images) : []
  const defaultUrls = imageSrcs(normalizeManagedImages(defaultItineraryImages))
  const urls = imageSrcs(itineraryImages)
  const displayUrls = urls.length > 0 ? urls : defaultUrls
  const hotelImgs = hotel ? normalizeManagedImages(hotel.images) : []
  const hotelUrls = imageSrcs(hotelImgs)

  const daysArr = opt && Array.isArray(opt.days) ? opt.days : null
  const daysPlain =
    opt && !daysArr && typeof opt.days === 'string'
      ? opt.days
      : null

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

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-lg mx-auto min-h-full bg-white shadow-2xl">
          <header className="bg-gradient-to-br from-[#1a1a1a] to-[#2a2a2a] text-center py-10 px-6 border-b-4 border-[#c8a45d]">
            <p className="text-[#c8a45d] text-2xl font-light tracking-[0.15em]">LANKALUX</p>
            <p className="text-white/80 text-xs uppercase tracking-widest mt-2">Your journey</p>
          </header>

          <div className="px-6 py-8">
            <p className="text-stone-800 text-lg mb-6">Dear {clientName},</p>

            {includeItinerary && opt && (
              <>
                <h2 className="text-[#b8860b] text-xl font-semibold mb-2">{opt.title}</h2>
                {opt.summary && <p className="text-stone-600 text-sm mb-6 leading-relaxed">{opt.summary}</p>}

                {displayUrls.length > 0 && !daysArr && (
                  <div className="grid gap-3 mb-8">
                    <p className="text-stone-500 text-xs uppercase tracking-wider mb-1">
                      Itinerary photos ({displayUrls.length}) — customize below if needed
                    </p>
                    {displayUrls.map((src, i) => (
                      <div
                        key={i}
                        className="rounded-2xl overflow-hidden shadow-md ring-1 ring-stone-200/80 hover:shadow-lg transition-shadow duration-300"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={src} alt="" className="w-full max-h-56 object-cover" />
                      </div>
                    ))}
                  </div>
                )}

                {daysArr ? (
                  <>
                    {displayUrls.length > 0 && (
                      <>
                        <p className="text-stone-500 text-xs uppercase tracking-wider mb-2">
                          Itinerary photos ({displayUrls.length}) — customize below if needed
                        </p>
                        <div className="rounded-2xl overflow-hidden shadow-lg mb-8 ring-1 ring-stone-200">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={displayUrls[0]} alt="" className="w-full max-h-52 object-cover" />
                        </div>
                      </>
                    )}
                    <h3 className="text-stone-800 font-bold text-sm uppercase tracking-wider border-b border-[#c8a45d] pb-2 mb-6">
                      Itinerary — day by day
                    </h3>
                    {daysArr.map((day, i) => (
                      <DayBlock key={day.day} day={day} imageAfter={displayUrls[i + 1]} />
                    ))}
                    {displayUrls.length > daysArr.length + 1 && (
                      <div className="grid grid-cols-2 gap-3 mt-6">
                        {displayUrls.slice(daysArr.length + 1).map((src, i) => (
                          <div key={i} className="rounded-xl overflow-hidden shadow-md">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={src} alt="" className="w-full h-32 object-cover" />
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                ) : daysPlain ? (
                  <>
                    {displayUrls.length > 0 && (
                      <p className="text-stone-500 text-xs uppercase tracking-wider mb-2">
                        Itinerary photos ({displayUrls.length}) — customize below if needed
                      </p>
                    )}
                    {displayUrls.map((src, i) => (
                      <div key={i} className="rounded-2xl overflow-hidden mb-4 shadow-md">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={src} alt="" className="w-full max-h-48 object-cover" />
                      </div>
                    ))}
                    <pre className="whitespace-pre-wrap text-sm text-stone-700 font-sans leading-relaxed">{daysPlain}</pre>
                  </>
                ) : null}
              </>
            )}

            {includeHotel && hotel && (
              <div className={`${includeItinerary && opt ? 'mt-12 pt-10 border-t-2 border-[#c8a45d]' : ''}`}>
                <h3 className="text-[#b8860b] font-bold text-sm uppercase tracking-wider mb-4">Hotel</h3>
                <h4 className="text-xl font-bold text-stone-900">{hotel.name}</h4>
                <p className="text-stone-500 text-sm mt-1">{hotel.location}</p>
                <p className="text-stone-700 text-sm mt-3">
                  {hotel.roomType} · {hotel.starRating === 'Boutique' ? 'Boutique' : `${hotel.starRating}★`}
                </p>
                {hotel.showPrice && hotel.pricePerNight && (
                  <p className="text-[#b8860b] font-semibold mt-2">{hotel.pricePerNight} / night</p>
                )}
                {hotel.description && <p className="text-stone-600 text-sm mt-4 leading-relaxed">{hotel.description}</p>}
                {hotelUrls.length > 0 && (
                  <div className="grid gap-3 mt-6">
                    {hotelUrls.map((src, i) => (
                      <div
                        key={i}
                        className="rounded-2xl overflow-hidden shadow-lg ring-1 ring-stone-200 hover:shadow-xl transition-shadow duration-300"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={src} alt="" className="w-full max-h-56 object-cover" />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <p className="text-stone-500 text-sm mt-12 pt-8 border-t border-stone-200">Warm regards,<br />The LankaLux Team</p>

            {includeItinerary && opt && requestId && onItineraryImagesChange && (
              <div className="mt-10 pt-8 border-t border-stone-200">
                {!showImageEditor ? (
                  <button
                    type="button"
                    onClick={() => setShowImageEditor(true)}
                    className="inline-flex items-center gap-2 px-5 py-3 rounded-xl border-2 border-[#c8a45d] text-[#b8860b] font-semibold hover:bg-[#c8a45d]/10 transition-colors"
                  >
                    <ImageIcon className="w-5 h-5" />
                    Customize Images
                  </button>
                ) : (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onItineraryImagesChange(defaultItineraryImages)}
                        disabled={savingImages || defaultItineraryImages.length === 0}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-stone-300 text-stone-600 text-sm font-medium hover:bg-stone-100 disabled:opacity-50"
                      >
                        <RotateCcw className="w-4 h-4" />
                        Reset to Default Images
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowImageEditor(false)}
                        className="px-4 py-2 rounded-lg text-stone-500 text-sm hover:bg-stone-100"
                      >
                        Done
                      </button>
                    </div>
                    <div className="rounded-xl border border-stone-200 bg-stone-50/80 p-4">
                      <ImageManager
                        items={itineraryImages.length > 0 ? itineraryImages : defaultItineraryImages}
                        onChange={onItineraryImagesChange}
                        requestId={requestId}
                        sectionLabel="Itinerary images (order: first = hero, then Day 1, Day 2…)"
                        disabled={savingImages}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
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
