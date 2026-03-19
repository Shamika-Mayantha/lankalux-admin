import type { ManagedImageItem } from '@/lib/managed-image'
import { normalizeManagedImages } from '@/lib/managed-image'

export type StarRating = '3' | '4' | '5' | 'Boutique'

export interface HotelRecord {
  id: string
  name: string
  location: string
  mapsUrl: string
  starRating: StarRating
  roomType: string
  showPrice: boolean
  pricePerNight: string
  description: string
  images: ManagedImageItem[]
}

export interface HotelOptionsPayload {
  hotels: HotelRecord[]
  selectedHotelId: string | null
}

export function emptyHotel(): Omit<HotelRecord, 'id'> {
  return {
    name: '',
    location: '',
    mapsUrl: '',
    starRating: '5',
    roomType: 'Deluxe',
    showPrice: false,
    pricePerNight: '',
    description: '',
    images: [],
  }
}

export function parseHotelOptions(raw: string | null | undefined): HotelOptionsPayload {
  if (!raw || typeof raw !== 'string') {
    return { hotels: [], selectedHotelId: null }
  }
  try {
    const p = JSON.parse(raw)
    const hotels = Array.isArray(p.hotels)
      ? p.hotels
          .filter((h: unknown) => h && typeof (h as HotelRecord).id === 'string')
          .map((h: unknown) => {
            const rec = h as HotelRecord
            return { ...rec, images: normalizeManagedImages(rec.images) }
          })
      : []
    return {
      hotels,
      selectedHotelId: typeof p.selectedHotelId === 'string' ? p.selectedHotelId : null,
    }
  } catch {
    return { hotels: [], selectedHotelId: null }
  }
}
