import geo from '@/lib/srilanka-map.json'

/**
 * The island outline from lankalux.com and the towns a generated itinerary usually names,
 * so a shared itinerary can draw its route. Map units are a plain lat/lon projection
 * fitted to the outline (Colombo, Kandy and Galle land where the website puts them).
 */
export const MAP_VIEWBOX = geo.viewBox
export const MAP_OUTLINE = geo.outline

const project = (lat: number, lon: number): [number, number] => [
  +(70.5 + (lon - 79.8612) * 140.5).toFixed(1),
  +(436.2 - (lat - 6.9271) * 139.7).toFixed(1),
]

type PlaceDef = { name: string; match: string[]; at: [number, number] }

const PLACES: PlaceDef[] = [
  { name: 'Colombo Airport', match: ['airport', 'katunayake', 'bandaranaike'], at: project(7.1808, 79.8841) },
  { name: 'Negombo', match: ['negombo'], at: project(7.2008, 79.8737) },
  { name: 'Colombo', match: ['colombo'], at: project(6.9271, 79.8612) },
  { name: 'Kalpitiya', match: ['kalpitiya'], at: project(8.2333, 79.7667) },
  { name: 'Wilpattu', match: ['wilpattu'], at: project(8.4561, 80.0137) },
  { name: 'Anuradhapura', match: ['anuradhapura'], at: project(8.3114, 80.4037) },
  { name: 'Jaffna', match: ['jaffna'], at: project(9.6615, 80.0255) },
  { name: 'Trincomalee', match: ['trincomalee', 'nilaveli', 'uppuveli'], at: project(8.5874, 81.2152) },
  { name: 'Pasikudah', match: ['pasikudah', 'passikudah', 'pasikuda'], at: project(7.9277, 81.563) },
  { name: 'Batticaloa', match: ['batticaloa'], at: project(7.731, 81.6747) },
  { name: 'Habarana', match: ['habarana', 'minneriya', 'kaudulla'], at: project(8.0369, 80.7486) },
  { name: 'Sigiriya', match: ['sigiriya', 'sigirya'], at: project(7.957, 80.7603) },
  { name: 'Polonnaruwa', match: ['polonnaruwa'], at: project(7.9403, 81.0188) },
  { name: 'Dambulla', match: ['dambulla'], at: project(7.8567, 80.6492) },
  { name: 'Matale', match: ['matale'], at: project(7.4675, 80.6234) },
  { name: 'Pinnawala', match: ['pinnawala'], at: project(7.3008, 80.387) },
  { name: 'Kandy', match: ['kandy', 'peradeniya'], at: project(7.2906, 80.6337) },
  { name: 'Kitulgala', match: ['kitulgala'], at: project(6.9917, 80.4186) },
  { name: 'Hatton', match: ['hatton', 'adams peak', "adam's peak", 'sri pada'], at: project(6.8916, 80.5955) },
  { name: 'Nuwara Eliya', match: ['nuwara eliya', 'nuwaraeliya', 'horton plains'], at: project(6.9497, 80.7891) },
  { name: 'Haputale', match: ['haputale', 'bandarawela'], at: project(6.7681, 80.9583) },
  { name: 'Ella', match: ['ella'], at: project(6.8667, 81.0466) },
  { name: 'Ratnapura', match: ['ratnapura'], at: project(6.6828, 80.3992) },
  { name: 'Sinharaja', match: ['sinharaja'], at: project(6.4, 80.5) },
  { name: 'Udawalawe', match: ['udawalawe', 'uda walawe'], at: project(6.4747, 80.8987) },
  { name: 'Yala', match: ['yala', 'tissamaharama', 'tissa', 'kataragama'], at: project(6.3728, 81.5167) },
  { name: 'Arugam Bay', match: ['arugam'], at: project(6.8406, 81.8368) },
  { name: 'Tangalle', match: ['tangalle', 'tangalla'], at: project(6.0243, 80.7941) },
  { name: 'Mirissa', match: ['mirissa', 'weligama'], at: project(5.9483, 80.4716) },
  { name: 'Galle', match: ['galle', 'unawatuna', 'koggala', 'ahangama'], at: project(6.0535, 80.221) },
  { name: 'Hikkaduwa', match: ['hikkaduwa'], at: project(6.1395, 80.1063) },
  { name: 'Bentota', match: ['bentota', 'induruwa', 'kosgoda', 'ahungalla', 'balapitiya'], at: project(6.421, 80.0) },
  { name: 'Beruwala', match: ['beruwala', 'beruwela', 'kalutara', 'wadduwa'], at: project(6.4788, 79.9828) },
]

export type StoryPlace = { name: string; at: [number, number] }

/**
 * Where a day ends: the last known town its location names ("Ella to Yala" is Yala).
 * Whole-word matching, so "Ella" does not match "Nuwara Eliya" or "Bella".
 */
export function placeForLocation(location: string | undefined | null): StoryPlace | null {
  const text = ` ${(location || '').toLowerCase().replace(/[^a-z' ]+/g, ' ')} `
  let best: { place: PlaceDef; pos: number } | null = null
  for (const p of PLACES) {
    for (const m of p.match) {
      const pos = text.lastIndexOf(` ${m} `)
      if (pos >= 0 && (!best || pos > best.pos)) best = { place: p, pos }
    }
  }
  return best ? { name: best.place.name, at: best.place.at } : null
}

/** A smooth curve (Catmull-Rom as cubic Béziers) through the given points, as an SVG path. */
export function routePath(pts: [number, number][]): string {
  if (pts.length < 2) return ''
  let d = `M${pts[0][0]} ${pts[0][1]}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[Math.min(pts.length - 1, i + 2)]
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]
    d += `C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0]} ${p2[1]}`
  }
  return d
}
