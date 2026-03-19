import type { ManagedImageItem } from '@/lib/managed-image'

export interface ItineraryOption {
  title: string
  days: string | { day: number; title: string; location: string; activities?: string[] }[]
  summary: string
  total_kilometers?: number
  images?: ManagedImageItem[]
}
