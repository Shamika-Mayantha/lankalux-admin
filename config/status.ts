export const REQUEST_STATUSES = ['new', 'follow_up', 'sold', 'after_sales', 'cancelled', 'expired'] as const
export type RequestStatus = (typeof REQUEST_STATUSES)[number]

export const LEGACY_STATUS_MAP: Record<string, RequestStatus> = {
  new: 'new',
  follow_up: 'follow_up',
  deposit: 'sold',
  sold: 'sold',
  after_sales: 'after_sales',
  cancelled: 'cancelled',
  closed: 'cancelled',
  expired: 'expired',
}

export const STATUS_LABEL: Record<RequestStatus, string> = {
  new: 'New',
  follow_up: 'Follow Up',
  sold: 'Sold',
  after_sales: 'After Sales',
  cancelled: 'Cancelled',
  expired: 'Expired',
}

/** Open enquiries expire this many calendar days after the planned start date. */
export const EXPIRE_AFTER_DAYS = 3
export const EXPIRABLE_STATUSES: RequestStatus[] = ['new', 'follow_up']

export function todayIsoDate(now = new Date()): string {
  return now.toISOString().slice(0, 10)
}

export function daysAfterStart(startDate: string | null | undefined, today = todayIsoDate()): number | null {
  if (!startDate) return null
  const start = startDate.slice(0, 10)
  const a = Date.parse(`${start}T00:00:00Z`)
  const b = Date.parse(`${today}T00:00:00Z`)
  if (Number.isNaN(a) || Number.isNaN(b)) return null
  return Math.floor((b - a) / 86400000)
}

export function isStartDateExpired(startDate: string | null | undefined, today = todayIsoDate()): boolean {
  const days = daysAfterStart(startDate, today)
  return days != null && days >= EXPIRE_AFTER_DAYS
}

export function shouldExpireRequest(
  row: { start_date?: string | null; status?: string | null },
  today = todayIsoDate()
): boolean {
  const status = normalizeStatus(row.status)
  if (!status || !EXPIRABLE_STATUSES.includes(status)) return false
  return isStartDateExpired(row.start_date, today)
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
