/**
 * Long dashes (— and –) read as machine-written, so LankaLux text never uses them.
 * The prompts ask the models not to; this cleans whatever slips through. The plain
 * "10:30 AM - " separator in older, timed activities stays as it is.
 */

export const NO_DASHES_RULE =
  'Never use em dashes (—) or en dashes (–) anywhere in the text. Use a comma, a full stop or the word "to" instead.'

const TIME = String.raw`\d{1,2}[:.]\d{2}(?:\s*[AP]M)?`

export function undash(text: string): string {
  if (!/[—–]/.test(text)) return text
  return (
    text
      .replace(/^(Day\s+\d+)\s*[—–]\s*/i, '$1: ') // "Day 1 – Saturday" heading labels
      .replace(new RegExp(`(${TIME})\\s*[–—]\\s*(\\d)`, 'gi'), '$1 to $2') // 9:00 AM – 11:00 AM
      .replace(/(\d)\s*[–—]\s*(\d)/g, '$1 to $2') // ranges: 4–7 days
      .replace(new RegExp(`(^|\\n)(\\s*${TIME})\\s*[—–]\\s*`, 'gi'), '$1$2 - ') // "10:30 AM – Visit" keeps the format
      .replace(/\s*[—–]\s*([.,!?;:)])/g, '$1') // a dash right before punctuation adds nothing
      .replace(/\s*[—–]\s*$/gm, '')
      .replace(/\s*[—–]\s*/g, ', ')
      .replace(/,\s*,/g, ',')
      .replace(/^,\s*/gm, '')
  )
}

/** Cleans every string inside a parsed itinerary, leaving keys, numbers and paths alone. */
export function undashDeep<T>(value: T): T {
  if (typeof value === 'string') {
    return (/^(\/|https?:)/.test(value) ? value : undash(value)) as T
  }
  if (Array.isArray(value)) return value.map(undashDeep) as T
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, undashDeep(v)])) as T
  }
  return value
}
