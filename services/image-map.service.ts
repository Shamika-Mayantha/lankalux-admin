/**
 * Central destination → photograph mapping.
 * Uses only real files that exist under public/images/. The full-resolution lankalux.com photos
 * live in public/images/hq/ (with small previews in hq/thumbs/) and come first in each pool.
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
    images: ['/images/hq/signaturejourney-sigjourneycmb.jpg', '/images/hq/signaturejourney-depart.jpg', '/images/arrivalincolombo.jpg', '/images/colombo.jpg', '/images/depart.jpg'],
  },
  {
    key: 'Sigiriya',
    aliases: ['sigiriya', 'sigirya', 'dambulla', 'habarana', 'cultural triangle', 'pidurangala'],
    images: ['/images/hq/sigirya.jpg', '/images/hq/signaturejourney-sigjhp1.jpg', '/images/sigirya.jpg', '/images/temple.jpg'],
  },
  {
    key: 'Kandy',
    aliases: ['kandy', 'tooth', 'temple of the tooth', 'peradeniya'],
    images: ['/images/hq/kandy.jpg', '/images/kandy.jpg', '/images/temple.jpg'],
  },
  {
    key: 'Nuwara Eliya',
    aliases: ['nuwara eliya', 'nuwaraeliya', 'little england', 'gregory', 'tea country'],
    images: ['/images/hq/gregorylake.jpg', '/images/hq/stclairs.jpg', '/images/hq/tea-hills.jpg', '/images/hq/damrotea.jpg', '/images/nuwaraeliya.jpg', '/images/damrotea.jpg', '/images/waterfall.jpg'],
  },
  {
    key: 'Ella',
    aliases: ['ella', 'nine arch', 'nine arches', 'little adams', 'ella rock', 'demodara'],
    images: [
      '/images/hq/nine-arch-bridge.jpg',
      '/images/hq/hillcountry-hillcountryhp.jpg',
      '/images/Ella Rock.jpg',
      '/images/Train 1.jpg',
      '/images/damrotea.jpg',
    ],
  },
  {
    key: 'Yala',
    aliases: ['yala', 'safari', 'leopard', 'wildlife', 'national park', 'bundala', 'udawalawe'],
    images: ['/images/hq/leopard.jpg', '/images/hq/elephant.jpg', '/images/hq/elephants.jpg', '/images/leopard.jpg', '/images/elephant.jpg', '/images/bear.jpg'],
  },
  {
    key: 'Mirissa',
    aliases: ['mirissa', 'whale', 'weligama', 'coconut tree hill'],
    images: ['/images/hq/mirissa.jpg', '/images/hq/coconut-tree-hill.jpg', '/images/mirissa.jpg', '/images/beach.jpg', '/images/surfing.jpg'],
  },
  {
    key: 'Galle',
    aliases: ['galle', 'galle fort', 'fort'],
    images: ['/images/hq/galle-lighthouse.jpg', '/images/galle.jpg', '/images/gallefort.jpg'],
  },
  {
    key: 'Unawatuna',
    aliases: ['unawatuna', 'jungle beach'],
    images: ['/images/unawatuna.jpg', '/images/beach.jpg'],
  },
  {
    key: 'Arugam Bay',
    aliases: ['arugam', 'arugam bay', 'surf'],
    images: ['/images/hq/arugambay.jpg', '/images/surfing.jpg', '/images/beach.jpg'],
  },
  {
    key: 'Wilpattu',
    aliases: ['wilpattu', 'sloth bear'],
    images: ['/images/hq/bear.jpg', '/images/bear.jpg', '/images/elephant.jpg'],
  },
]

// public/images/nine-arches-bridge-train-sri-lanka-53.jpg only exists for itineraries saved before
// it was dropped from the library (it was missing, so those days showed a broken photo).

/** Every lankalux.com photo, offered in the photo picker even where no destination uses it. */
const WEBSITE_PHOTOS = [
  '/images/hq/arugambay.jpg',
  '/images/hq/atamasthana.jpg',
  '/images/hq/bear.jpg',
  '/images/hq/coast-bay.jpg',
  '/images/hq/coastalretreat-coastalhp.jpg',
  '/images/hq/coastalretreat-day1.jpg',
  '/images/hq/coastalretreat-day2.jpg',
  '/images/hq/coastalretreat-day3.jpg',
  '/images/hq/coastalretreat-day6.jpg',
  '/images/hq/coastalretreat-day7.jpg',
  '/images/hq/coconut-tree-hill.jpg',
  '/images/hq/damrotea.jpg',
  '/images/hq/elephant.jpg',
  '/images/hq/elephants.jpg',
  '/images/hq/galle-lighthouse.jpg',
  '/images/hq/gregorylake.jpg',
  '/images/hq/hillcountry-day1.jpg',
  '/images/hq/hillcountry-day2.jpg',
  '/images/hq/hillcountry-day3.jpg',
  '/images/hq/hillcountry-day4.jpg',
  '/images/hq/hillcountry-day5.jpg',
  '/images/hq/hillcountry-day6.jpg',
  '/images/hq/hillcountry-day7.jpg',
  '/images/hq/hillcountry-hillcountryhp.jpg',
  '/images/hq/homepage-homepage1.jpg',
  '/images/hq/homepage-homepage2.jpg',
  '/images/hq/homepage-homepage3.jpg',
  '/images/hq/homepage-homepage4.jpg',
  '/images/hq/homepage-homepage5.jpg',
  '/images/hq/homepage-homepage6.jpg',
  '/images/hq/kandy.jpg',
  '/images/hq/leopard.jpg',
  '/images/hq/mirissa.jpg',
  '/images/hq/naturewildlife-day2.jpg',
  '/images/hq/naturewildlife-day3.jpg',
  '/images/hq/naturewildlife-day4.jpg',
  '/images/hq/naturewildlife-day5.jpg',
  '/images/hq/naturewildlife-day6.jpg',
  '/images/hq/naturewildlife-day7.jpg',
  '/images/hq/naturewildlife-day8.jpg',
  '/images/hq/naturewildlife-wildlifehp.jpg',
  '/images/hq/naturewildlife-wildlifehp1.jpg',
  '/images/hq/nine-arch-bridge.jpg',
  '/images/hq/platter.jpg',
  '/images/hq/rainforest.jpg',
  '/images/hq/sigirya.jpg',
  '/images/hq/signaturejourney-depart.jpg',
  '/images/hq/signaturejourney-sigjhp1.jpg',
  '/images/hq/signaturejourney-sigjourneycmb.jpg',
  '/images/hq/signaturejourney-signaturejourney.jpg',
  '/images/hq/stclairs.jpg',
  '/images/hq/tea-hills.jpg',
  '/images/hq/tea-leaves.jpg',
]

/** The small preview of a library photo, for picker tiles (full-resolution photos are 2200px wide). */
export function thumbFor(src: string): string {
  return src.startsWith('/images/hq/') ? src.replace('/images/hq/', '/images/hq/thumbs/') : src
}

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
    const existing = (day.recommended_images || []).filter(
      (src) =>
        src.startsWith('/images/') ||
        src.startsWith('/Fleet/') ||
        src.startsWith('/uploads/') ||
        src.includes('/storage/v1/object/public/')
    )
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
  for (const src of [...FALLBACK, ...WEBSITE_PHOTOS]) {
    if (!seen.has(src)) {
      seen.add(src)
      out.push(src)
    }
  }
  return out
}

export const DESTINATION_KEYS = MAPPINGS.map((m) => m.key)
