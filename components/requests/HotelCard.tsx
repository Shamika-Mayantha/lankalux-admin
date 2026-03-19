'use client'

import { useState } from 'react'
import { Building2, ChevronLeft, ChevronRight, Pencil, Trash2, MapPin } from 'lucide-react'
import type { HotelRecord } from '@/lib/hotel-types'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'

export function HotelCard({
  hotel,
  selected,
  onSelect,
  onEdit,
  onDelete,
  disabled,
}: {
  hotel: HotelRecord
  selected: boolean
  onSelect: () => void
  onEdit: () => void
  onDelete: () => void
  disabled?: boolean
}) {
  const imgs = hotel.images.slice(0, 5)
  const [idx, setIdx] = useState(0)
  const safeIdx = imgs.length ? idx % imgs.length : 0

  return (
    <div
      className={`rounded-2xl border-2 overflow-hidden flex flex-col transition-all duration-300 bg-gradient-to-b from-zinc-900/90 to-[#121110] shadow-lg hover:shadow-xl hover:shadow-[#d4af37]/5 hover:-translate-y-1 ${
        selected ? 'border-[#d4af37] ring-2 ring-[#d4af37]/40' : 'border-zinc-700 hover:border-zinc-600'
      }`}
    >
      <div className="relative aspect-[16/10] bg-zinc-950">
        {imgs.length > 0 ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imgs[safeIdx]} alt="" className="w-full h-full object-cover" />
            {imgs.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setIdx((i) => (i - 1 + imgs.length) % imgs.length)
                  }}
                  className="absolute left-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/60 text-white hover:bg-black/80"
                  aria-label="Previous image"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setIdx((i) => (i + 1) % imgs.length)
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/60 text-white hover:bg-black/80"
                  aria-label="Next image"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
                  {imgs.map((_, i) => (
                    <span
                      key={i}
                      className={`h-1.5 rounded-full transition-all ${i === safeIdx ? 'w-6 bg-[#d4af37]' : 'w-1.5 bg-white/40'}`}
                    />
                  ))}
                </div>
              </>
            )}
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center text-zinc-600">
            <Building2 className="w-16 h-16 opacity-40" />
          </div>
        )}
        {selected && (
          <div className="absolute top-3 right-3">
            <Badge>Selected</Badge>
          </div>
        )}
      </div>
      <div className="p-5 flex-1 flex flex-col">
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className="text-lg font-bold text-[#f5f0e6] leading-tight">{hotel.name}</h3>
        </div>
        <p className="text-sm text-zinc-500 flex items-center gap-1 mb-3">
          <MapPin className="w-3.5 h-3.5 shrink-0" />
          {hotel.location || 'Location TBC'}
          {hotel.mapsUrl ? (
            <a
              href={hotel.mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#d4af37] hover:underline ml-1"
              onClick={(e) => e.stopPropagation()}
            >
              Map
            </a>
          ) : null}
        </p>
        <p className="text-sm text-[#c4a035] mb-2">
          {hotel.roomType}
          <span className="text-zinc-500 mx-2">·</span>
          <span className="text-zinc-400">
            {hotel.starRating === 'Boutique' ? 'Boutique' : `${hotel.starRating}★`}
          </span>
        </p>
        {hotel.description && (
          <p className="text-sm text-zinc-400 line-clamp-3 mb-3 flex-1">{hotel.description}</p>
        )}
        {hotel.showPrice && hotel.pricePerNight && (
          <p className="text-sm font-medium text-[#d4af37] mb-4">{hotel.pricePerNight} / night</p>
        )}
        <div className="flex flex-wrap gap-2 mt-auto pt-2">
          <Button size="sm" variant="secondary" onClick={onEdit} className="flex-1 min-w-[4rem]">
            <Pencil className="w-4 h-4" />
            Edit
          </Button>
          <Button size="sm" variant="danger" onClick={onDelete} className="flex-1 min-w-[4rem]">
            <Trash2 className="w-4 h-4" />
            Delete
          </Button>
          <Button size="sm" onClick={onSelect} disabled={disabled} className="flex-1 min-w-[6rem] basis-full sm:basis-auto">
            {selected ? 'Deselect' : 'Select hotel'}
          </Button>
        </div>
      </div>
    </div>
  )
}
