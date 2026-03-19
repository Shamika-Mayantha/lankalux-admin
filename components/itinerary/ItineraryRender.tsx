'use client'

import { imageSrcs, normalizeManagedImages } from '@/lib/managed-image'
import type { HotelRecord } from '@/lib/hotel-types'

export type RenderDay = {
  day: number
  title: string
  location: string
  image?: string
  activities?: string[]
  optional_activities?: string[]
  what_to_expect?: string
}

export type RenderItinerary = {
  title: string
  summary: string
  days: RenderDay[]
}

export type RenderVehicle = {
  name: string
  description: string
  images: string[]
} | null

export function ItineraryRender({
  clientName,
  startDate,
  endDate,
  duration,
  itinerary,
  hotel,
  vehicle,
  price,
  mode,
  images,
  editable = false,
  onReplace,
  onRemove,
  onAdd,
  onReorder,
}: {
  clientName: string
  startDate?: string | null
  endDate?: string | null
  duration?: number | null
  itinerary: RenderItinerary
  hotel?: HotelRecord | null
  vehicle?: RenderVehicle
  price?: string | null
  mode: 'preview' | 'link'
  images?: string[]
  editable?: boolean
  onReplace?: (index: number) => void
  onRemove?: (index: number) => void
  onAdd?: () => void
  onReorder?: (from: number, to: number) => void
}) {
  const hotelUrls = hotel ? imageSrcs(normalizeManagedImages(hotel.images)) : []
  const dayImageSrc = (day: RenderDay, idx: number) => images?.[idx] || day.image || ''
  return (
    <div className={mode === 'preview' ? 'max-w-4xl mx-auto bg-white rounded-2xl shadow-lg' : 'min-h-screen bg-white'}>
      <div className="bg-gradient-to-b from-[#fafafa] to-white py-10 border-b-2 border-[#c8a45d]">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h1 className="text-4xl font-serif font-bold text-[#2c2c2c] mb-3">{itinerary.title}</h1>
          <p className="text-lg text-gray-600">Prepared for {clientName}</p>
          <div className="flex flex-wrap justify-center gap-6 mt-5 text-sm text-gray-600">
            {startDate ? <span>Start: {new Date(startDate).toLocaleDateString('en-US')}</span> : null}
            {endDate ? <span>End: {new Date(endDate).toLocaleDateString('en-US')}</span> : null}
            {duration ? <span>{duration} Days</span> : null}
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-[#fafafa] border-l-4 border-[#c8a45d] p-6 rounded-r-lg">
          <p className="text-gray-700 leading-relaxed font-serif">{itinerary.summary}</p>
        </div>
      </div>

      {price ? (
        <div className="max-w-4xl mx-auto px-4 pb-8">
          <div className="bg-gradient-to-br from-[#faf8f5] to-white border-2 border-[#c8a45d] rounded-xl p-6">
            <p className="text-2xl font-serif font-bold text-[#c8a45d]">{price}</p>
          </div>
        </div>
      ) : null}

      <div className="max-w-4xl mx-auto px-4 pb-12">
        <h2 className="text-3xl font-serif font-bold text-[#2c2c2c] mb-8 text-center">Your Journey</h2>
        <div className="space-y-10">
          {itinerary.days.map((day, idx) => (
            <div key={`${day.day}-${idx}`}>
              {dayImageSrc(day, idx) ? (
                <div
                  className={`mb-5 rounded-lg overflow-hidden ${editable ? 'group relative' : ''}`}
                  draggable={editable}
                  onDragStart={(e) => {
                    if (!editable) return
                    e.dataTransfer.setData('text/plain', String(idx))
                  }}
                  onDragOver={(e) => editable && e.preventDefault()}
                  onDrop={(e) => {
                    if (!editable || !onReorder) return
                    const from = parseInt(e.dataTransfer.getData('text/plain'), 10)
                    if (!isNaN(from)) onReorder(from, idx)
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={dayImageSrc(day, idx)} alt={day.title || day.location} className="w-full h-64 object-cover" />
                  {editable ? (
                    <div className="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => onReplace?.(idx)}
                        className="px-3 py-1.5 rounded-md bg-white/95 text-stone-900 text-xs font-semibold"
                      >
                        Replace
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemove?.(idx)}
                        className="px-3 py-1.5 rounded-md bg-red-600 text-white text-xs font-semibold"
                      >
                        Remove
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
              <div className="bg-white border-2 border-[#c8a45d] rounded-lg p-6 shadow-sm">
                <p className="text-[#c8a45d] font-bold text-2xl mb-1">Day {day.day}</p>
                <p className="text-xl font-serif text-[#2c2c2c] mb-1">{day.title}</p>
                <p className="text-sm uppercase tracking-wide text-[#c8a45d] mb-4">{day.location}</p>
                {day.what_to_expect ? <p className="text-gray-700 italic mb-4">{day.what_to_expect}</p> : null}
                {day.activities && day.activities.length > 0 ? (
                  <ul className="space-y-2 text-gray-700">
                    {day.activities.map((a, i) => (
                      <li key={i} className="flex items-start">
                        <span className="text-[#c8a45d] mr-2">•</span>
                        <span>{a}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </div>
          ))}
        </div>
        {editable ? (
          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={() => onAdd?.()}
              className="px-4 py-2 rounded-lg border border-[#c8a45d] text-[#8b6f2a] text-sm font-medium hover:bg-[#faf3df]"
            >
              + Add Image
            </button>
          </div>
        ) : null}
      </div>

      {vehicle ? (
        <div className="max-w-4xl mx-auto px-4 pb-12">
          <div className="bg-white border-2 border-[#c8a45d] rounded-lg p-6">
            <h3 className="text-2xl font-serif font-bold text-[#2c2c2c] mb-1">Your Vehicle</h3>
            <p className="text-lg font-semibold text-[#c8a45d] mb-3">{vehicle.name}</p>
            <p className="text-gray-700 mb-4">{vehicle.description}</p>
            {vehicle.images?.[0] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={vehicle.images[0]} alt={vehicle.name} className="w-full h-64 object-cover rounded-lg" />
            ) : null}
          </div>
        </div>
      ) : null}

      {hotel ? (
        <div className="max-w-4xl mx-auto px-4 pb-12">
          <div className="bg-white border-2 border-[#c8a45d] rounded-lg p-6">
            <h3 className="text-2xl font-serif font-bold text-[#2c2c2c] mb-1">Hotel</h3>
            <p className="text-lg font-semibold text-[#c8a45d] mb-2">{hotel.name}</p>
            <p className="text-gray-600 mb-2">{hotel.location}</p>
            {hotel.description ? <p className="text-gray-700 mb-4">{hotel.description}</p> : null}
            {hotelUrls[0] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={hotelUrls[0]} alt={hotel.name} className="w-full h-64 object-cover rounded-lg" />
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}

