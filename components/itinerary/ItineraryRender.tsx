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

function parseDayHeading(dayNumber: number, rawTitle: string) {
  const title = rawTitle || ''
  const dayMatch = title.match(/^day\s*(\d+)/i)
  const parsedDay = dayMatch ? parseInt(dayMatch[1], 10) : dayNumber

  // Remove leading "Day X -" / "Day X –" / "Day X:"
  let cleaned = title.replace(/^day\s*\d+\s*[-–:]\s*/i, '')
  // Remove leading date chunk like "Tuesday, June 2, 2026:"
  cleaned = cleaned.replace(/^[A-Za-z]+,\s+[A-Za-z]+\s+\d{1,2},\s+\d{4}\s*:?\s*/i, '')
  // Remove accidental duplicated "Day X -" again after first cleanup
  cleaned = cleaned.replace(/^day\s*\d+\s*[-–:]\s*/i, '')
  cleaned = cleaned.trim()

  const finalTitle = cleaned || title.trim()
  return {
    day: Number.isNaN(parsedDay) ? dayNumber : parsedDay,
    title: finalTitle,
  }
}

function formatDayDate(startDate?: string | null, dayNumber?: number) {
  if (!startDate || !dayNumber) return null
  const date = new Date(startDate)
  if (Number.isNaN(date.getTime())) return null
  date.setDate(date.getDate() + (dayNumber - 1))
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function elegantTitle(raw: string) {
  const text = (raw || '').trim()
  if (!text) return 'Your Sri Lanka Journey'
  const noPrefix = text.replace(/^option\s*\d+\s*[:\-–]\s*/i, '').trim()
  const base = noPrefix.split(':')[0].trim() || noPrefix
  if (base.length <= 58) return base
  return `${base.slice(0, 55).trim()}...`
}

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
  onItineraryChange,
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
  onItineraryChange?: (next: RenderItinerary) => void
}) {
  const hotelUrls = hotel ? imageSrcs(normalizeManagedImages(hotel.images)) : []
  const dayImageSrc = (day: RenderDay, idx: number) => images?.[idx] || day.image || ''
  const updateDay = (idx: number, updater: (current: RenderDay) => RenderDay) => {
    if (!onItineraryChange) return
    const nextDays = itinerary.days.map((d, i) => (i === idx ? updater(d) : d))
    onItineraryChange({ ...itinerary, days: nextDays })
  }
  return (
    <div className={mode === 'preview' ? 'max-w-4xl mx-auto bg-white rounded-3xl shadow-xl shadow-black/10 overflow-hidden' : 'min-h-screen bg-[#fbfaf7]'}>
      <div className="bg-gradient-to-b from-[#f8f6f2] via-[#fffdf9] to-white py-12 border-b border-[#dcc48e]">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <p className="text-[12px] font-serif tracking-[0.08em] text-[#9c8352] mb-2">Prepared for</p>
          <p className="text-[28px] font-serif text-[#2d2a26] mb-4">{clientName}</p>
          {editable ? (
            <input
              value={itinerary.title || ''}
              onChange={(e) => onItineraryChange?.({ ...itinerary, title: e.target.value })}
              placeholder="Itinerary title"
              className="w-full max-w-2xl mx-auto block text-center text-3xl md:text-4xl font-serif font-semibold text-[#2b261f] mb-4 leading-tight bg-white border border-[#e3d5b7] rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#c8a45d]"
            />
          ) : (
            <h1 className="text-3xl md:text-4xl font-serif font-semibold text-[#2b261f] mb-4 leading-tight">{elegantTitle(itinerary.title)}</h1>
          )}
          <div className="w-20 h-[1px] bg-[#c9a14a]/70 mx-auto mb-5" />
          <div className="flex flex-wrap justify-center gap-6 mt-4 text-sm text-[#6f6758]">
            {startDate ? <span>Start: {new Date(startDate).toLocaleDateString('en-US')}</span> : null}
            {endDate ? <span>End: {new Date(endDate).toLocaleDateString('en-US')}</span> : null}
            {duration ? <span>{duration} Days</span> : null}
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-10">
        <div className="p-7 rounded-2xl bg-[#fcfbf8] border border-[#ebdfc3]">
          {editable ? (
            <textarea
              value={itinerary.summary || ''}
              onChange={(e) => onItineraryChange?.({ ...itinerary, summary: e.target.value })}
              rows={4}
              placeholder="Itinerary summary"
              className="w-full text-[#4c473f] leading-8 font-serif text-lg bg-white border border-[#e3d5b7] rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#c8a45d]"
            />
          ) : (
            <p className="text-[#4c473f] leading-8 font-serif text-lg">{itinerary.summary}</p>
          )}
        </div>
      </div>

      {price ? (
        <div className="max-w-4xl mx-auto px-4 pb-8">
          <div className="bg-gradient-to-br from-[#fdfaf2] to-white border border-[#dbc28f] rounded-2xl p-6">
            <p className="text-2xl font-serif font-semibold text-[#b78f3a]">{price}</p>
          </div>
        </div>
      ) : null}

      <div className="max-w-4xl mx-auto px-6 pb-14">
        <h2 className="text-3xl font-serif font-semibold text-[#2c2c2c] mb-10 text-center">Your Journey</h2>
        <div className="space-y-12">
          {itinerary.days.map((day, idx) => (
            <div key={`${day.day}-${idx}`}>
              {dayImageSrc(day, idx) ? (
                <div
                  className={`mb-6 rounded-2xl overflow-hidden ring-1 ring-[#e6dbc2] ${editable ? 'group relative' : ''}`}
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
                  <img
                    src={dayImageSrc(day, idx)}
                    alt={day.title || day.location}
                    className={`w-full h-[280px] object-cover ${editable ? 'cursor-pointer' : ''}`}
                    onClick={() => {
                      if (editable) onReplace?.(idx)
                    }}
                  />
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
              <div className="bg-white border border-[#e3d5b7] rounded-2xl p-7 shadow-sm shadow-black/5">
                {(() => {
                  const heading = parseDayHeading(day.day, day.title)
                  const dayDate = formatDayDate(startDate, heading.day)
                  const headingTitle =
                    heading.title && !/^day\s*\d+$/i.test(heading.title.trim())
                      ? heading.title
                      : (day.location ? `Arrival in ${day.location}` : 'Journey Highlights')
                  return (
                    <div className="mb-7">
                      <p className="text-lg font-semibold text-[#c49a44] mb-2 tracking-[0.03em]">Day {heading.day}</p>
                      {editable ? (
                        <input
                          value={day.title || ''}
                          onChange={(e) => updateDay(idx, (current) => ({ ...current, title: e.target.value }))}
                          placeholder="Day title"
                          className="w-full text-[28px] leading-tight font-serif font-semibold text-[#22201c] mb-2 bg-[#fffcf5] border border-[#eadfca] rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#c8a45d]"
                        />
                      ) : (
                        <p className="text-[30px] leading-tight font-serif font-semibold text-[#22201c] mb-2">{headingTitle}</p>
                      )}
                      {dayDate ? <p className="text-sm text-[#8b8579] mb-2">{dayDate}</p> : null}
                      {editable ? (
                        <input
                          value={day.location || ''}
                          onChange={(e) => updateDay(idx, (current) => ({ ...current, location: e.target.value }))}
                          placeholder="Location"
                          className="w-full text-xs font-semibold uppercase tracking-[0.14em] text-[#b88b35] bg-[#fffcf5] border border-[#eadfca] rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#c8a45d]"
                        />
                      ) : day.location ? (
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#c49a44]">{day.location}</p>
                      ) : null}
                    </div>
                  )
                })()}
                {editable ? (
                  <textarea
                    value={day.what_to_expect || ''}
                    onChange={(e) => updateDay(idx, (current) => ({ ...current, what_to_expect: e.target.value }))}
                    rows={3}
                    placeholder="What to expect / description"
                    className="w-full text-[#5b5750] italic mb-5 leading-7 bg-[#fffcf5] border border-[#eadfca] rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#c8a45d]"
                  />
                ) : day.what_to_expect ? (
                  <p className="text-[#5b5750] italic mb-5 leading-7">{day.what_to_expect}</p>
                ) : null}
                {day.activities && day.activities.length > 0 ? (
                  <ul className="space-y-2.5 text-[#4d4a45]">
                    {day.activities.map((a, i) => (
                      <li key={i} className="flex items-start">
                        <span className="text-[#c8a45d] mr-2 mt-2">•</span>
                        {editable ? (
                          <input
                            value={a}
                            onChange={(e) =>
                              updateDay(idx, (current) => {
                                const acts = [...(current.activities || [])]
                                acts[i] = e.target.value
                                return { ...current, activities: acts }
                              })
                            }
                            placeholder={`Activity ${i + 1}`}
                            className="flex-1 bg-[#fffcf5] border border-[#eadfca] rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#c8a45d]"
                          />
                        ) : (
                          <span>{a}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {editable ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => updateDay(idx, (current) => ({ ...current, activities: [...(current.activities || []), ''] }))}
                      className="px-3 py-1.5 rounded-md border border-[#c8a45d] text-[#8b6f2a] text-sm hover:bg-[#faf3df]"
                    >
                      + Add Activity
                    </button>
                    {day.activities && day.activities.length > 0 ? (
                      <button
                        type="button"
                        onClick={() =>
                          updateDay(idx, (current) => ({ ...current, activities: (current.activities || []).slice(0, -1) }))
                        }
                        className="px-3 py-1.5 rounded-md border border-[#e6cfcf] text-[#9b3d3d] text-sm hover:bg-[#fff1f1]"
                      >
                        Remove Last Activity
                      </button>
                    ) : null}
                  </div>
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
            className="px-4 py-2 rounded-xl border border-[#c8a45d] text-[#8b6f2a] text-sm font-medium hover:bg-[#faf3df]"
            >
              + Add Image
            </button>
          </div>
        ) : null}
      </div>

      {vehicle ? (
        <div className="max-w-4xl mx-auto px-6 pb-12">
          <div className="bg-white border border-[#e3d5b7] rounded-2xl p-7">
            <h3 className="text-2xl font-serif font-semibold text-[#2c2c2c] mb-1">Your Vehicle</h3>
            <p className="text-lg font-semibold text-[#c8a45d] mb-3">{vehicle.name}</p>
            <p className="text-[#4d4a45] mb-5 leading-7">{vehicle.description}</p>
            {vehicle.images?.[0] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={vehicle.images[0]} alt={vehicle.name} className="w-full h-64 object-cover rounded-xl" />
            ) : null}
          </div>
        </div>
      ) : null}

      {hotel ? (
        <div className="max-w-4xl mx-auto px-6 pb-12">
          <div className="bg-white border border-[#e3d5b7] rounded-2xl p-7">
            <h3 className="text-2xl font-serif font-semibold text-[#2c2c2c] mb-1">Hotel</h3>
            <p className="text-lg font-semibold text-[#c8a45d] mb-2">{hotel.name}</p>
            <p className="text-[#6a655b] mb-2">{hotel.location}</p>
            {hotel.description ? <p className="text-[#4d4a45] mb-5 leading-7">{hotel.description}</p> : null}
            {hotelUrls[0] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={hotelUrls[0]} alt={hotel.name} className="w-full h-64 object-cover rounded-xl" />
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}

