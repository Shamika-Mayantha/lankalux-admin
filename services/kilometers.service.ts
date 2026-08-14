import { matchDestination } from '@/services/image-map.service'
import type { ItineraryDay } from '@/types/domain'

/** Local exploration kilometres on a non-transfer day. */
export const LOCAL_DAY_KM = 90

/**
 * Realistic ROAD distances (km), from the LankaLux itinerary rule:
 * Colombo–Sigiriya 170, Sigiriya–Kandy 100, Kandy–Nuwara Eliya 80,
 * Nuwara Eliya–Ella 50, Ella–Yala 120, Yala–Galle 200, Galle–Colombo 120.
 */
const ROAD: Record<string, Record<string, number>> = {
  Colombo: {
    Sigiriya: 170,
    Kandy: 115,
    'Nuwara Eliya': 160,
    Ella: 220,
    Yala: 260,
    Galle: 120,
    Mirissa: 150,
    Unawatuna: 130,
    'Arugam Bay': 320,
    Wilpattu: 180,
  },
  Sigiriya: {
    Colombo: 170,
    Kandy: 100,
    'Nuwara Eliya': 140,
    Ella: 180,
    Yala: 250,
    Galle: 280,
    Mirissa: 270,
    Wilpattu: 90,
    'Arugam Bay': 220,
  },
  Kandy: {
    Colombo: 115,
    Sigiriya: 100,
    'Nuwara Eliya': 80,
    Ella: 140,
    Yala: 220,
    Galle: 230,
    Mirissa: 240,
    Wilpattu: 160,
  },
  'Nuwara Eliya': {
    Colombo: 160,
    Sigiriya: 140,
    Kandy: 80,
    Ella: 50,
    Yala: 170,
    Galle: 200,
    Mirissa: 190,
  },
  Ella: {
    Colombo: 220,
    Sigiriya: 180,
    Kandy: 140,
    'Nuwara Eliya': 50,
    Yala: 120,
    Galle: 180,
    Mirissa: 170,
    'Arugam Bay': 130,
  },
  Yala: {
    Colombo: 260,
    Sigiriya: 250,
    Kandy: 220,
    'Nuwara Eliya': 170,
    Ella: 120,
    Galle: 200,
    Mirissa: 180,
    Unawatuna: 195,
    'Arugam Bay': 90,
  },
  Galle: {
    Colombo: 120,
    Sigiriya: 280,
    Kandy: 230,
    'Nuwara Eliya': 200,
    Ella: 180,
    Yala: 200,
    Mirissa: 40,
    Unawatuna: 15,
  },
  Mirissa: {
    Colombo: 150,
    Galle: 40,
    Unawatuna: 35,
    Yala: 180,
    Ella: 170,
  },
  Unawatuna: {
    Colombo: 130,
    Galle: 15,
    Mirissa: 35,
    Yala: 195,
  },
  'Arugam Bay': {
    Colombo: 320,
    Ella: 130,
    Yala: 90,
    Sigiriya: 220,
  },
  Wilpattu: {
    Colombo: 180,
    Sigiriya: 90,
    Kandy: 160,
  },
}

export type KmLeg = {
  from: string
  to: string
  km: number
  kind: 'transfer' | 'local' | 'return'
}

export function placeKey(text: string | null | undefined): string {
  const mapped = matchDestination(text)
  if (mapped && mapped.key !== 'Default') return mapped.key
  const trimmed = (text || '').trim()
  return trimmed || 'Colombo'
}

export function roadKm(from: string, to: string): number {
  const a = placeKey(from)
  const b = placeKey(to)
  if (a === b) return 0
  const direct = ROAD[a]?.[b]
  if (typeof direct === 'number') return direct
  const viaColombo = (ROAD[a]?.Colombo ?? 0) + (ROAD.Colombo?.[b] ?? 0)
  if (viaColombo > 0) return viaColombo
  return 150
}

function overnightOf(day: { location?: string; overnight_location?: string }) {
  return placeKey(day.overnight_location || day.location)
}

function locationOf(day: { location?: string; overnight_location?: string }) {
  return placeKey(day.location || day.overnight_location)
}

/**
 * Journey starts in Colombo and ends in Colombo.
 * Transfer days: road distance between cities.
 * Non-transfer days: 90km local exploration.
 * Plus return from the last overnight to Colombo unless the last night is already Colombo.
 */
export function calculateTotalKilometers(
  days: Array<{ location?: string; overnight_location?: string }>
): { total: number; legs: KmLeg[] } {
  if (!days.length) return { total: 0, legs: [] }
  const legs: KmLeg[] = []
  let prev = 'Colombo'

  for (const day of days) {
    const curr = locationOf(day)
    if (curr !== prev) {
      const km = roadKm(prev, curr)
      legs.push({ from: prev, to: curr, km, kind: 'transfer' })
    } else {
      legs.push({ from: curr, to: curr, km: LOCAL_DAY_KM, kind: 'local' })
    }
    prev = overnightOf(day)
  }

  if (prev !== 'Colombo') {
    legs.push({ from: prev, to: 'Colombo', km: roadKm(prev, 'Colombo'), kind: 'return' })
  }

  const total = legs.reduce((sum, leg) => sum + leg.km, 0)
  return { total, legs }
}

export function totalKilometersFor(
  days: Array<{ location?: string; overnight_location?: string }>
): number {
  return calculateTotalKilometers(days).total
}

export function applyJourneyKilometers(days: ItineraryDay[]): { days: ItineraryDay[]; total: number } {
  const { total, legs } = calculateTotalKilometers(days)
  const dayLegs = legs.filter((leg) => leg.kind !== 'return')
  const next = days.map((day, i) => {
    const leg = dayLegs[i]
    if (!leg || leg.kind !== 'transfer') return day
    return {
      ...day,
      travel: {
        from: leg.from,
        to: leg.to,
        estimated_distance: `${leg.km} km`,
        estimated_duration: day.travel?.estimated_duration || '',
      },
    }
  })
  return { days: next, total }
}

export function formatKilometers(km: number | null | undefined): string {
  if (km == null || !Number.isFinite(km) || km <= 0) return ''
  return `${Math.round(km).toLocaleString()} km`
}
