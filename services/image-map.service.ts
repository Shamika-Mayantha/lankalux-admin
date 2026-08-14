/**
 * Central destination → photograph mapping.
 * Uses only real files that exist under public/images/.
 * Do not hardcode these paths in React components — import from here.
 */

export type DestinationKey =
  | 'Colombo'
  | 'Sigiriya'
  | 'Kandy'
  | 'Nuwara Eliya'
  | 'Ella'
  | 'Yala'
  | 'Mirissa'
  | 'Galle'
  | 'Unawatuna'
  | 'Arugam Bay'
  | 'Wilpattu'
  | 'Default'

type Mapping = {
  key: DestinationKey
  aliases: string[]
  images: string[]
}

const MAPPINGS: Mapping[] = [
  {
    key: 'Colombo',
    aliases: ['colombo', 'airport', 'katunayake', 'negombo', 'arrival', 'departure'],
    images: ['/images/arrivalincolombo.jpg', '/images/colombo.jpg', '/images/depart.jpg'],
  },
  {
    key: 'Sigiriya',
    aliases: ['sigiriya', 'sigirya', 'dambulla', 'habarana', 'cultural triangle', 'pidurangala'],
    images: ['/images/sigirya.jpg', '/images/temple.jpg'],
  },
  {
    key: 'Kandy',
    aliases: ['kandy', 'tooth', 'temple of the tooth', 'peradeniya'],
    images: ['/images/kandy.jpg', '/images/temple.jpg'],
  },
  {
    key: 'Nuwara Eliya',
    aliases: ['nuwara eliya', 'nuwaraeliya', 'little england', 'gregory', 'tea country'],
    images: ['/images/nuwaraeliya.jpg', '/images/damrotea.jpg', '/images/waterfall.jpg'],
  },
  {
    key: 'Ella',
    aliases: ['ella', 'nine arch', 'nine arches', 'little adams', 'ella rock', 'demodara'],
    images: [
      '/images/Ella Rock.jpg',
      '/images/Train 1.jpg',
      '/images/nine-arches-bridge-train-sri-lanka-53.jpg',
      '/images/damrotea.jpg',
    ],
  },
  {
    key: 'Yala',
    aliases: ['yala', 'safari', 'leopard', 'wildlife', 'national park', 'bundala', 'udawalawe'],
    images: ['/images/leopard.jpg', '/images/elephant.jpg', '/images/bear.jpg'],
  },
  {
    key: 'Mirissa',
    aliases: ['mirissa', 'whale', 'weligama', 'coconut tree hill'],
    images: ['/images/mirissa.jpg', '/images/beach.jpg', '/images/surfing.jpg'],
  },
  {
    key: 'Galle',
    aliases: ['galle', 'galle fort', 'fort'],
    images: ['/images/galle.jpg', '/images/gallefort.jpg'],
  },
  {
    key: 'Unawatuna',
    aliases: ['unawatuna', 'jungle beach'],
    images: ['/images/unawatuna.jpg', '/images/beach.jpg'],
  },
  {
    key: 'Arugam Bay',
    aliases: ['arugam', 'arugam bay', 'surf'],
    images: ['/images/surfing.jpg', '/images/beach.jpg'],
  },
  {
    key: 'Wilpattu',
    aliases: ['wilpattu', 'sloth bear'],
    images: ['/images/bear.jpg', '/images/elephant.jpg'],
  },
]

const FALLBACK = ['/images/colombo.jpg', '/images/kandy.jpg', '/images/galle.jpg']

function norm(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

export function matchDestination(text: string | null | undefined): Mapping | null {
  if (!text) return null
  const n = norm(text)
  if (!n) return null
  for (const m of MAPPINGS) {
    if (m.aliases.some((a) => n.includes(a))) return m
  }
  return null
}

export function imagesForLocation(location: string | null | undefined, used: Set<string> = new Set()): string[] {
  const mapping = matchDestination(location)
  const pool = mapping?.images ?? FALLBACK
  const unique = pool.filter((src) => !used.has(src))
  const chosen = unique.length ? unique : pool
  return chosen
}

export function assignDayImages(
  days: Array<{ location?: string; title?: string; recommended_images?: string[] }>
): string[][] {
  const used = new Set<string>()
  return days.map((day) => {
    const existing = (day.recommended_images || []).filter((src) => src.startsWith('/images/') || src.startsWith('/Fleet/'))
    if (existing.length) {
      existing.forEach((s) => used.add(s))
      return existing
    }
    const fromTitle = matchDestination(`${day.title || ''} ${day.location || ''}`)
    const pool = fromTitle?.images ?? imagesForLocation(day.location, used)
    const pick = pool.find((src) => !used.has(src)) || pool[0]
    if (pick) used.add(pick)
    return pick ? [pick] : []
  })
}

export function allLibraryImages(): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const m of MAPPINGS) {
    for (const src of m.images) {
      if (!seen.has(src)) {
        seen.add(src)
        out.push(src)
      }
    }
  }
  for (const src of FALLBACK) {
    if (!seen.has(src)) out.push(src)
  }
  return out
}

export const DESTINATION_KEYS = MAPPINGS.map((m) => m.key)
