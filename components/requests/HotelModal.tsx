'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import type { HotelRecord, StarRating } from '@/lib/hotel-types'
import { emptyHotel } from '@/lib/hotel-types'
import { ImageUploader } from './ImageUploader'
import { Button } from '@/components/ui/Button'

const STARS: StarRating[] = ['3', '4', '5', 'Boutique']
const ROOM_PRESETS = ['Deluxe', 'Suite', 'Family', 'Executive', 'Villa', 'Presidential']

export function HotelModal({
  open,
  onClose,
  onSave,
  requestId,
  initial,
}: {
  open: boolean
  onClose: () => void
  onSave: (hotel: HotelRecord) => void
  requestId: string
  initial: HotelRecord | null
}) {
  const [name, setName] = useState('')
  const [location, setLocation] = useState('')
  const [mapsUrl, setMapsUrl] = useState('')
  const [starRating, setStarRating] = useState<StarRating>('5')
  const [roomType, setRoomType] = useState('Deluxe')
  const [showPrice, setShowPrice] = useState(false)
  const [pricePerNight, setPricePerNight] = useState('')
  const [description, setDescription] = useState('')
  const [images, setImages] = useState<string[]>([])

  useEffect(() => {
    if (!open) return
    if (initial) {
      setName(initial.name)
      setLocation(initial.location)
      setMapsUrl(initial.mapsUrl)
      setStarRating(initial.starRating)
      setRoomType(initial.roomType)
      setShowPrice(initial.showPrice)
      setPricePerNight(initial.pricePerNight)
      setDescription(initial.description)
      setImages([...initial.images])
    } else {
      const e = emptyHotel()
      setName(e.name)
      setLocation(e.location)
      setMapsUrl(e.mapsUrl)
      setStarRating(e.starRating)
      setRoomType(e.roomType)
      setShowPrice(e.showPrice)
      setPricePerNight(e.pricePerNight)
      setDescription(e.description)
      setImages([])
    }
  }, [open, initial])

  if (!open) return null

  const save = () => {
    if (!name.trim()) {
      alert('Please enter a hotel name.')
      return
    }
    const hotel: HotelRecord = {
      id: initial?.id || crypto.randomUUID(),
      name: name.trim(),
      location: location.trim(),
      mapsUrl: mapsUrl.trim(),
      starRating,
      roomType: roomType.trim() || 'Deluxe',
      showPrice,
      pricePerNight: pricePerNight.trim(),
      description: description.trim(),
      images,
    }
    onSave(hotel)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={() => onClose()}
    >
      <div
        className="bg-[#141210] border border-zinc-700 rounded-2xl shadow-2xl max-w-lg w-full max-h-[92vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <h2 className="text-lg font-semibold text-[#d4af37]">{initial ? 'Edit hotel' : 'Add hotel'}</h2>
          <button type="button" onClick={onClose} className="p-2 rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
          <div>
            <label className="text-xs text-zinc-500 uppercase tracking-wide">Hotel name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full px-4 py-2.5 rounded-xl bg-zinc-900 border border-zinc-700 text-zinc-100 focus:ring-2 focus:ring-[#d4af37]/50 focus:border-[#d4af37]"
              placeholder="e.g. Cape Weligama"
            />
          </div>
          <div>
            <label className="text-xs text-zinc-500 uppercase tracking-wide">Location (city)</label>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="mt-1 w-full px-4 py-2.5 rounded-xl bg-zinc-900 border border-zinc-700 text-zinc-100 focus:ring-2 focus:ring-[#d4af37]/50"
              placeholder="e.g. Weligama"
            />
          </div>
          <div>
            <label className="text-xs text-zinc-500 uppercase tracking-wide">Google Maps link (optional)</label>
            <input
              value={mapsUrl}
              onChange={(e) => setMapsUrl(e.target.value)}
              className="mt-1 w-full px-4 py-2.5 rounded-xl bg-zinc-900 border border-zinc-700 text-zinc-100 focus:ring-2 focus:ring-[#d4af37]/50 text-sm"
              placeholder="https://maps.google.com/..."
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-zinc-500 uppercase tracking-wide">Star rating</label>
              <select
                value={starRating}
                onChange={(e) => setStarRating(e.target.value as StarRating)}
                className="mt-1 w-full px-4 py-2.5 rounded-xl bg-zinc-900 border border-zinc-700 text-zinc-100"
              >
                {STARS.map((s) => (
                  <option key={s} value={s}>
                    {s === 'Boutique' ? 'Boutique' : `${s} stars`}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className="text-xs text-zinc-500 uppercase tracking-wide">Room type</label>
              <input
                list="hotel-room-presets"
                value={roomType}
                onChange={(e) => setRoomType(e.target.value)}
                className="mt-1 w-full px-4 py-2.5 rounded-xl bg-zinc-900 border border-zinc-700 text-zinc-100"
                placeholder="Deluxe, Suite..."
              />
              <datalist id="hotel-room-presets">
                {ROOM_PRESETS.map((r) => (
                  <option key={r} value={r} />
                ))}
              </datalist>
            </div>
          </div>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={showPrice}
              onChange={(e) => setShowPrice(e.target.checked)}
              className="rounded border-zinc-600 text-[#d4af37] focus:ring-[#d4af37]"
            />
            <span className="text-sm text-zinc-300">Show price per night</span>
          </label>
          {showPrice && (
            <div>
              <label className="text-xs text-zinc-500 uppercase tracking-wide">Price per night</label>
              <input
                value={pricePerNight}
                onChange={(e) => setPricePerNight(e.target.value)}
                className="mt-1 w-full px-4 py-2.5 rounded-xl bg-zinc-900 border border-zinc-700 text-zinc-100"
                placeholder="e.g. USD 450"
              />
            </div>
          )}
          <div>
            <label className="text-xs text-zinc-500 uppercase tracking-wide">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="mt-1 w-full px-4 py-2.5 rounded-xl bg-zinc-900 border border-zinc-700 text-zinc-100 resize-y min-h-[100px]"
              placeholder="Short luxury-style description for the client..."
            />
          </div>
          <ImageUploader requestId={requestId} images={images} onChange={setImages} />
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-zinc-800 bg-zinc-900/50">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>Save hotel</Button>
        </div>
      </div>
    </div>
  )
}
