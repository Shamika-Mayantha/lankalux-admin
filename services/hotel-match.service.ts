import type { ItineraryDay } from '@/types/domain'

export type StayCandidate = {
  id: string
  name: string
  destination: string
  star_category?: string | null
  room_category?: string | null
  meal_plan?: string | null
  description?: string | null
  images?: string[]
  website?: string | null
}

export function normalizePlaceKey(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function placesMatch(a: string, b: string) {
  const left = normalizePlaceKey(a)
  const right = normalizePlaceKey(b)
  if (!left || !right) return false
  if (left === right) return true
  return left.includes(right) || right.includes(left)
}

export function stayMeta(hotel: StayCandidate) {
  const bits: string[] = []
  const star = (hotel.star_category || '').trim()
  if (star) bits.push(star.toLowerCase() === 'boutique' ? 'Boutique' : `${star}-star`)
  if (hotel.room_category?.trim()) bits.push(hotel.room_category.trim())
  if (hotel.meal_plan?.trim()) bits.push(hotel.meal_plan.trim())
  return bits
}

export function stayLine(hotel: StayCandidate) {
  const meta = stayMeta(hotel)
  return meta.length ? `Overnight at ${hotel.name} (${meta.join(' · ')}).` : `Overnight at ${hotel.name}.`
}

export function checkInLine(hotel: StayCandidate) {
  return `07:00 PM - Check in at ${hotel.name}`
}

function dayPlace(day: Pick<ItineraryDay, 'location' | 'overnight_location'>) {
  return day.overnight_location || day.location || ''
}

export function hotelsForDay(day: Pick<ItineraryDay, 'location' | 'overnight_location'>, hotels: StayCandidate[]) {
  const place = dayPlace(day)
  if (!place) return []
  return hotels.filter((hotel) => placesMatch(place, hotel.destination || ''))
}

function stripPreviousStay(day: ItineraryDay, hotels: StayCandidate[]): ItineraryDay {
  const names = hotels.map((hotel) => hotel.name).filter(Boolean)
  const overnightRe = /\n*Overnight at [^\n]+/g
  const description = (day.description || '').replace(overnightRe, '').trim()
  const activities = (day.activities || []).filter((line) => {
    const lower = line.toLowerCase()
    if (!/check in at /i.test(lower)) return true
    return !names.some((name) => lower.includes(name.toLowerCase()))
  })
  return { ...day, description, activities }
}

export function applyHotelsToDays(
  days: ItineraryDay[],
  hotels: StayCandidate[],
  opts?: { replace?: boolean }
): { days: ItineraryDay[]; matchCount: number } {
  if (!hotels.length) return { days, matchCount: 0 }
  const replace = opts?.replace !== false
  const used = new Map<string, number>()
  let matchCount = 0

  const next = days.map((original) => {
    const day = replace ? stripPreviousStay(original, hotels) : original
    const matches = hotelsForDay(day, hotels)
    if (!matches.length) return day

    const pick = matches
      .slice()
      .sort((a, b) => (used.get(a.id) || 0) - (used.get(b.id) || 0))[0]
    if (!pick) return day

    if (!replace && day.hotel_id) return day

    used.set(pick.id, (used.get(pick.id) || 0) + 1)
    matchCount += 1

    const line = stayLine(pick)
    const description = day.description.includes(pick.name)
      ? day.description
      : [day.description, line].filter(Boolean).join('\n\n')
    const hasCheckIn = day.activities.some((activity) => activity.toLowerCase().includes(pick.name.toLowerCase()))
    const activities = hasCheckIn ? day.activities : [...day.activities, checkInLine(pick)]

    return {
      ...day,
      hotel_id: pick.id,
      hotel_name: pick.name,
      description,
      activities,
    }
  })

  return { days: next, matchCount }
}

export function hotelsPromptSection(hotels: StayCandidate[]) {
  if (!hotels.length) {
    return `HOTELS
No hotels have been attached. Stays are optional. Do not invent hotel names. Overnight towns only.`
  }
  const lines = hotels.map((hotel) => {
    const meta = stayMeta(hotel)
    const where = hotel.destination?.trim() || 'destination TBC'
    return `- ${hotel.name} — ${where}${meta.length ? ` · ${meta.join(' · ')}` : ''}`
  })
  return `OPTIONAL SUGGESTED STAYS
The planner attached these hotels. They are optional extras, not a required booking list.
Use a hotel only when the overnight town matches its destination. Never invent other hotel names.
If a town has no attached hotel, leave overnight as the town name only.

${lines.join('\n')}

On a matching overnight, add one evening highlight: "07:00 PM - Check in at {hotel name}."`
}
