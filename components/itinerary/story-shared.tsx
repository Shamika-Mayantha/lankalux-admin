'use client'

import Image from 'next/image'
import { placeForLocation, routePath, type StoryPlace } from '@/lib/itinerary-places'
import { parseDayHeading, type RenderDay } from './ItineraryRender'

const OPTIMISED_REMOTE = /^https:\/\/evmsntnprujqfejkmipq\.supabase\.co\/storage\/v1\/object\/public\//

/** Fills its frame. Our own and Supabase photos are resized for the screen; anything else loads as-is. */
export function StoryPhoto({ src, alt, sizes, priority = false }: { src: string; alt: string; sizes: string; priority?: boolean }) {
  if (src.startsWith('/') || OPTIMISED_REMOTE.test(src)) {
    return <Image src={src} alt={alt} fill sizes={sizes} priority={priority} />
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} loading={priority ? 'eager' : 'lazy'} decoding="async" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
}

/** "2026-11-03" as a local date (not UTC midnight, which shows the day before west of London). */
export function localDate(value?: string | null, addDays = 0) {
  if (!value) return null
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/)
  const d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(value)
  if (Number.isNaN(d.getTime())) return null
  d.setDate(d.getDate() + addDays)
  return d
}
export const fmt = (d: Date | null, opts: Intl.DateTimeFormatOptions) => (d ? d.toLocaleDateString('en-GB', opts) : null)

export function dayHeading(day: RenderDay) {
  const heading = parseDayHeading(day.day, day.title)
  const title =
    heading.title && !/^day\s*\d+$/i.test(heading.title.trim())
      ? heading.title
      : day.location
        ? `Arrival in ${day.location}`
        : 'Journey Highlights'
  return { day: heading.day, title }
}

/** Where each day ends, carrying the last known town forward when a location is not on the map. */
export function buildRoute(days: RenderDay[]) {
  const stays: (StoryPlace | null)[] = []
  for (const d of days) stays.push(placeForLocation(d.location) ?? stays[stays.length - 1] ?? null)
  const paths = stays.map((s, i) => {
    const prev = i > 0 ? stays[i - 1] : null
    return s && prev && prev.name !== s.name ? routePath([prev.at, s.at]) : ''
  })
  const stops = Array.from(new Map(stays.filter((s): s is StoryPlace => !!s).map((s) => [s.name, s])).values())
  return { stays, paths, stops }
}
export type StoryRoute = ReturnType<typeof buildRoute>
