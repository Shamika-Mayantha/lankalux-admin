export const REQUEST_STATUSES = ['new', 'follow_up', 'sold', 'after_sales', 'cancelled'] as const
export type RequestStatus = (typeof REQUEST_STATUSES)[number]

export const LEGACY_STATUS_MAP: Record<string, RequestStatus> = {
  new: 'new',
  follow_up: 'follow_up',
  deposit: 'sold',
  sold: 'sold',
  after_sales: 'after_sales',
  cancelled: 'cancelled',
  closed: 'cancelled',
}

export const STATUS_LABEL: Record<RequestStatus, string> = {
  new: 'New',
  follow_up: 'Follow Up',
  sold: 'Sold',
  after_sales: 'After Sales',
  cancelled: 'Cancelled',
}

export function normalizeStatus(raw: string | null | undefined): RequestStatus | null {
  if (!raw) return null
  return LEGACY_STATUS_MAP[raw.toLowerCase()] ?? null
}

export const ITINERARY_STYLES = ['balanced', 'relaxed', 'experience'] as const
export type ItineraryStyle = (typeof ITINERARY_STYLES)[number]

export const STYLE_META: Record<
  ItineraryStyle,
  { number: 1 | 2 | 3; label: string; subtitle: string }
> = {
  balanced: { number: 1, label: 'Option 1', subtitle: 'Balanced / Recommended' },
  relaxed: { number: 2, label: 'Option 2', subtitle: 'Relaxed / Comfort focused' },
  experience: { number: 3, label: 'Option 3', subtitle: 'Experience / Exploration focused' },
}

export function styleFromNumber(n: number): ItineraryStyle {
  if (n === 2) return 'relaxed'
  if (n === 3) return 'experience'
  return 'balanced'
}

export const PROMPT_VERSION = 'll-itinerary-v2-2026-08-14'
export const ID_PREFIX = 'req-id-'
export const INACTIVITY_MS = 45 * 60 * 1000
export const WHATSAPP_BUSINESS_DEFAULT = '94763261788'
