/**
 * Generated LankaLux days carry no clock times: the chauffeur sets the pace with the guests on
 * the day, and a printed "09:00 AM" reads like a tour bus schedule. The prompt asks for plain
 * named highlights; this removes any time that slips through.
 */

const CLOCK = String.raw`\d{1,2}(?:[:.]\d{2})?\s*[ap]\.?\s?m\.?(?![a-z])|\d{1,2}[:.]\d{2}(?:\s*hrs?\b)?`

const LEADING = new RegExp(String.raw`^\s*(?:${CLOCK})(?:\s*(?:to|until|-|–|—)\s*(?:${CLOCK}))?\s*(?:[-–—:|.]\s*)?`, 'i')
const INLINE = new RegExp(String.raw`\s*\(?\b(?:at|by|around|from|until|till|before|after|approx\.?|approximately)?\s*(?:${CLOCK})(?:\s*(?:to|until|-|–|—)\s*(?:${CLOCK}))?\)?`, 'gi')

export function untime(text: string): string {
  if (!text) return text
  let out = text
    .replace(LEADING, '')
    .replace(INLINE, '')
    .replace(/\s*\((?:if time allows|time permitting|optional)\)\s*/gi, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim()
  if (out && /^[a-z]/.test(out)) out = out[0].toUpperCase() + out.slice(1)
  return out
}

type DayLike = { activities?: unknown; optional_activities?: unknown; description?: unknown; what_to_expect?: unknown; title?: unknown }

/** Strips clock times from the text fields of generated days, leaving everything else as it is. */
export function untimeDays<T extends DayLike>(days: T[]): T[] {
  const lines = (v: unknown) => (Array.isArray(v) ? v.map((x) => (typeof x === 'string' ? untime(x) : x)).filter((x) => x !== '') : v)
  const text = (v: unknown) => (typeof v === 'string' ? untime(v) : v)
  return days.map((d) => ({
    ...d,
    activities: lines(d.activities),
    optional_activities: lines(d.optional_activities),
    description: text(d.description),
    what_to_expect: text(d.what_to_expect),
    title: text(d.title),
  }))
}
