import type { DriverPackFields } from '@/types/domain'

const DRIVER_PACK_KEYS: Array<keyof DriverPackFields> = [
  'guest_names',
  'travel_start',
  'travel_end',
  'chauffeur_guide_name',
  'chauffeur_guide_phone',
  'vehicle_registration',
  'arrival_flight',
  'arrival_date',
  'arrival_time',
  'departure_flight',
  'departure_date',
  'departure_time',
  'notes',
]

export function parseDriverPack(raw: unknown): DriverPackFields {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const source = raw as Record<string, unknown>
  const out: DriverPackFields = {}
  for (const key of DRIVER_PACK_KEYS) {
    const value = source[key]
    if (value == null) continue
    const text = String(value).trim()
    if (text) out[key] = text
  }
  return out
}
