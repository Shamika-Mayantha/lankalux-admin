/**
 * The prompt lists words that make itineraries read as machine-written, but smaller models
 * still use them. This swaps the common ones for plain words and drops filler phrases.
 */

const SWAPS: [RegExp, string][] = [
  [/\s*\(?\b(?:a |an )?UNESCO(?:[- ]listed| World Heritage(?: Site)?| site)?\b\)?,?/gi, ''],
  [/\bnestled (?:in|among|between|on)\b/gi, 'set in'],
  [/\bnestled\b/gi, 'set'],
  [/\bbreathtaking\b/gi, 'sweeping'],
  [/\bstunning\b/gi, 'striking'],
  [/\bvibrant\b/gi, 'lively'],
  [/\bunwind\b/gi, 'relax'],
  [/\bimmerse yourself in\b/gi, 'enjoy'],
  [/\bimmerse\b/gi, 'take in'],
  [/\bembark on\b/gi, 'begin'],
  [/\bhidden gem\b/gi, 'quiet find'],
  [/\bunforgettable\b/gi, 'memorable'],
  [/\bboasts\b/gi, 'has'],
  [/\bdelve into\b/gi, 'explore'],
  [/\btapestry of\b/gi, 'mix of'],
  [/\ba must[- ]see\b/gi, 'a highlight'],
  [/,?\s*\(?\b(?:if time (?:allows|permits)|time permitting|if desired|check conditions)\b\)?/gi, ''],
  [/!/g, '.'],
]

export function plainVoice(text: string): string {
  if (!text) return text
  let out = text
  for (const [re, to] of SWAPS) out = out.replace(re, to)
  out = out
    .replace(/\s+([,.;:])/g, '$1')
    .replace(/(^|[.!?]\s+),\s*/g, '$1')
    .replace(/,\s*([.;:]|$)/g, '$1')
    .replace(/\.{2,}/g, '.')
    .replace(/\s{2,}/g, ' ')
    .replace(/(^|[.!?]\s+)([a-z])/g, (_m, p: string, c: string) => p + c.toUpperCase())
    .trim()
  return out
}

/** Applies plainVoice to every string in a parsed itinerary, leaving keys, numbers and paths alone. */
export function plainVoiceDeep<T>(value: T): T {
  if (typeof value === 'string') return (/^(\/|https?:)/.test(value) ? value : plainVoice(value)) as T
  if (Array.isArray(value)) return value.map(plainVoiceDeep) as T
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, plainVoiceDeep(v)])) as T
  }
  return value
}
