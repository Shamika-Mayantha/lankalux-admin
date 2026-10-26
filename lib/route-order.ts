/**
 * Keeps generated journeys moving forward. The model is asked not to backtrack, but it still
 * slips (a waterfall behind you after a safari ahead of you, a temple 60 km off the coast road,
 * a second night back in a town you already left). This file checks a day list against real
 * coordinates and fixes what code can fix safely: the order of stops within a transfer day,
 * and stops that sit far off that day's road.
 */

type GeoPlace = { name: string; match: string[]; lat: number; lon: number; town?: boolean }

/** Overnight towns (town: true) and the named sights generated days usually mention. */
const GAZETTEER: GeoPlace[] = [
  // Airport belt and Colombo
  { name: 'Colombo Airport', match: ['airport', 'katunayake', 'bandaranaike', 'cmb'], lat: 7.1808, lon: 79.8841, town: true },
  { name: 'Negombo', match: ['negombo'], lat: 7.2008, lon: 79.8737, town: true },
  { name: 'Colombo', match: ['colombo'], lat: 6.9271, lon: 79.8612, town: true },
  { name: 'Mount Lavinia', match: ['mount lavinia'], lat: 6.839, lon: 79.863, town: true },
  { name: 'Galle Face Green', match: ['galle face'], lat: 6.9245, lon: 79.8445 },
  { name: 'Gangaramaya Temple', match: ['gangaramaya'], lat: 6.9166, lon: 79.8563 },
  { name: 'Pettah', match: ['pettah', 'jami ul alfar', 'red mosque'], lat: 6.9369, lon: 79.85 },
  { name: 'Independence Square', match: ['independence square', 'independence memorial'], lat: 6.904, lon: 79.868 },
  { name: 'Viharamahadevi Park', match: ['viharamahadevi'], lat: 6.913, lon: 79.861 },
  { name: 'Kelaniya Temple', match: ['kelaniya'], lat: 6.9531, lon: 79.922 },
  // North west and north
  { name: 'Kalpitiya', match: ['kalpitiya'], lat: 8.2333, lon: 79.7667, town: true },
  { name: 'Wilpattu', match: ['wilpattu'], lat: 8.4561, lon: 80.0137, town: true },
  { name: 'Anuradhapura', match: ['anuradhapura'], lat: 8.3114, lon: 80.4037, town: true },
  { name: 'Mihintale', match: ['mihintale'], lat: 8.3509, lon: 80.5156 },
  { name: 'Jaffna', match: ['jaffna'], lat: 9.6615, lon: 80.0255, town: true },
  // Kegalle and Kurunegala roads
  { name: 'Pinnawala', match: ['pinnawala'], lat: 7.3008, lon: 80.387 },
  { name: 'Kegalle', match: ['kegalle'], lat: 7.2513, lon: 80.3464 },
  { name: 'Kurunegala', match: ['kurunegala', 'athugala'], lat: 7.4863, lon: 80.3647 },
  { name: 'Yapahuwa', match: ['yapahuwa'], lat: 7.8186, lon: 80.3086 },
  { name: 'Ridi Viharaya', match: ['ridi vihara', 'ridi viharaya', 'silver temple'], lat: 7.5444, lon: 80.4767 },
  // Cultural Triangle
  { name: 'Sigiriya', match: ['sigiriya', 'sigirya', 'lion rock'], lat: 7.957, lon: 80.7603, town: true },
  { name: 'Pidurangala', match: ['pidurangala'], lat: 7.9667, lon: 80.7569 },
  { name: 'Dambulla', match: ['dambulla'], lat: 7.8567, lon: 80.6492, town: true },
  { name: 'Habarana', match: ['habarana'], lat: 8.0369, lon: 80.7486, town: true },
  { name: 'Minneriya', match: ['minneriya'], lat: 8.0376, lon: 80.8925 },
  { name: 'Kaudulla', match: ['kaudulla'], lat: 8.15, lon: 80.92 },
  { name: 'Hurulu Eco Park', match: ['hurulu'], lat: 8.13, lon: 80.83 },
  { name: 'Polonnaruwa', match: ['polonnaruwa', 'gal vihara'], lat: 7.9403, lon: 81.0188, town: true },
  { name: 'Ritigala', match: ['ritigala'], lat: 8.11, lon: 80.66 },
  { name: 'Kaludiya Pokuna', match: ['kaludiya'], lat: 7.88, lon: 80.62 },
  { name: 'Nalanda Gedige', match: ['nalanda'], lat: 7.6714, lon: 80.6339 },
  { name: 'Aluvihara', match: ['aluvihara', 'aluvihare'], lat: 7.4985, lon: 80.6203 },
  { name: 'Matale', match: ['matale'], lat: 7.4675, lon: 80.6234 },
  { name: 'Riverston', match: ['riverston'], lat: 7.52, lon: 80.73 },
  // Kandy
  { name: 'Kandy', match: ['kandy', 'temple of the tooth', 'sri dalada', 'tooth relic'], lat: 7.2906, lon: 80.6337, town: true },
  { name: 'Peradeniya', match: ['peradeniya'], lat: 7.269, lon: 80.5965 },
  { name: 'Udawattakele', match: ['udawattakele', 'udawatta kele'], lat: 7.2989, lon: 80.6411 },
  { name: 'Bahirawakanda', match: ['bahirawakanda'], lat: 7.2958, lon: 80.6267 },
  { name: 'Embekke', match: ['embekke'], lat: 7.2186, lon: 80.5594 },
  { name: 'Gadaladeniya', match: ['gadaladeniya'], lat: 7.2556, lon: 80.5458 },
  { name: 'Lankatilaka', match: ['lankatilaka'], lat: 7.2386, lon: 80.5672 },
  { name: 'Ambuluwawa', match: ['ambuluwawa'], lat: 7.1608, lon: 80.5458 },
  { name: 'Knuckles', match: ['knuckles'], lat: 7.4, lon: 80.8 },
  // Tea country
  { name: 'Gampola', match: ['gampola'], lat: 7.164, lon: 80.577 },
  { name: 'Kotmale', match: ['kotmale'], lat: 7.059, lon: 80.596 },
  { name: 'Ramboda', match: ['ramboda'], lat: 7.057, lon: 80.696 },
  { name: 'Labukele', match: ['labukele', 'labookellie', 'mackwoods'], lat: 7.035, lon: 80.705 },
  { name: 'Glenloch', match: ['glenloch'], lat: 7.088, lon: 80.66 },
  { name: 'Nuwara Eliya', match: ['nuwara eliya', 'nuwaraeliya', 'gregory', 'little england'], lat: 6.9497, lon: 80.7891, town: true },
  { name: 'Moon Plains', match: ['moon plains'], lat: 6.9547, lon: 80.7471 },
  { name: "Lover's Leap", match: ["lover's leap", 'lovers leap'], lat: 6.9707, lon: 80.7873 },
  { name: 'Hakgala', match: ['hakgala', 'seetha amman', 'sita amman', 'seetha eliya'], lat: 6.9264, lon: 80.8189 },
  { name: 'Ambewela', match: ['ambewela'], lat: 6.88, lon: 80.8 },
  { name: 'Horton Plains', match: ['horton plains', "world's end", 'worlds end', 'baker'], lat: 6.802, lon: 80.807 },
  { name: 'Nanu Oya', match: ['nanu oya'], lat: 6.9406, lon: 80.7476 },
  { name: 'Hatton', match: ['hatton', 'dickoya', 'castlereagh'], lat: 6.8916, lon: 80.5955, town: true },
  { name: "Adam's Peak", match: ["adam's peak", 'adams peak', 'sri pada'], lat: 6.8096, lon: 80.4994 },
  { name: 'Kitulgala', match: ['kitulgala'], lat: 6.9917, lon: 80.4186, town: true },
  // Ella and Uva
  { name: 'Haputale', match: ['haputale', "lipton's seat", 'liptons seat', 'dambatenne'], lat: 6.7681, lon: 80.9583, town: true },
  { name: 'Bandarawela', match: ['bandarawela'], lat: 6.829, lon: 80.99, town: true },
  { name: 'Dowa Rock Temple', match: ['dowa'], lat: 6.851, lon: 81.008 },
  { name: 'Ella', match: ['ella', 'nine arch', 'nine arches', 'demodara', "little adam's", 'little adams', 'ella rock', 'ella gap'], lat: 6.8667, lon: 81.0466, town: true },
  { name: 'Ravana Falls', match: ['ravana falls', 'rawana falls', 'ravana ella', 'rawana'], lat: 6.8411, lon: 81.0526 },
  { name: 'Diyaluma Falls', match: ['diyaluma'], lat: 6.7355, lon: 81.0336 },
  { name: 'Wellawaya', match: ['wellawaya'], lat: 6.7369, lon: 81.1036 },
  { name: 'Buduruwagala', match: ['buduruwagala'], lat: 6.6936, lon: 81.111 },
  { name: 'Belihuloya', match: ['belihuloya'], lat: 6.72, lon: 80.77, town: true },
  // Deep south and south east
  { name: 'Udawalawe', match: ['udawalawe', 'uda walawe', 'elephant transit'], lat: 6.4747, lon: 80.8987, town: true },
  { name: 'Yala', match: ['yala'], lat: 6.3728, lon: 81.5167, town: true },
  { name: 'Tissamaharama', match: ['tissamaharama', 'tissa'], lat: 6.2847, lon: 81.2876, town: true },
  { name: 'Kataragama', match: ['kataragama'], lat: 6.4134, lon: 81.3346, town: true },
  { name: 'Bundala', match: ['bundala'], lat: 6.195, lon: 81.2104 },
  { name: 'Kirinda', match: ['kirinda'], lat: 6.214, lon: 81.33 },
  { name: 'Hambantota', match: ['hambantota'], lat: 6.124, lon: 81.1185 },
  { name: 'Mulkirigala', match: ['mulkirigala'], lat: 6.1223, lon: 80.7397 },
  { name: 'Tangalle', match: ['tangalle', 'tangalla'], lat: 6.0243, lon: 80.7941, town: true },
  { name: 'Hummanaya Blowhole', match: ['hummanaya', 'blowhole', 'blow hole'], lat: 5.962, lon: 80.718 },
  { name: 'Hiriketiya', match: ['hiriketiya', 'dikwella'], lat: 5.9636, lon: 80.7058, town: true },
  { name: 'Matara', match: ['matara', 'dondra'], lat: 5.9549, lon: 80.555 },
  { name: 'Mirissa', match: ['mirissa', 'coconut tree hill', 'parrot rock'], lat: 5.9483, lon: 80.4716, town: true },
  { name: 'Weligama', match: ['weligama', 'stilt'], lat: 5.975, lon: 80.429, town: true },
  { name: 'Koggala', match: ['koggala', 'ahangama', 'martin wickramasinghe'], lat: 5.993, lon: 80.326, town: true },
  { name: 'Unawatuna', match: ['unawatuna', 'jungle beach', 'rumassala', 'peace pagoda'], lat: 6.01, lon: 80.249, town: true },
  { name: 'Galle', match: ['galle'], lat: 6.0267, lon: 80.217, town: true },
  { name: 'Hikkaduwa', match: ['hikkaduwa'], lat: 6.1395, lon: 80.1063, town: true },
  { name: 'Ambalangoda', match: ['ambalangoda', 'mask museum'], lat: 6.235, lon: 80.054 },
  { name: 'Madu Ganga', match: ['madu ganga', 'madu river', 'balapitiya'], lat: 6.27, lon: 80.04 },
  { name: 'Kosgoda', match: ['kosgoda'], lat: 6.332, lon: 80.027 },
  { name: 'Bentota', match: ['bentota', 'induruwa', 'ahungalla'], lat: 6.421, lon: 80.0, town: true },
  { name: 'Lunuganga', match: ['lunuganga'], lat: 6.43, lon: 80.02 },
  { name: 'Brief Garden', match: ['brief garden'], lat: 6.454, lon: 80.052 },
  { name: 'Kande Vihara', match: ['kande vihara', 'kande viharaya'], lat: 6.49, lon: 80.015 },
  { name: 'Beruwala', match: ['beruwala', 'beruwela', 'aluthgama'], lat: 6.4788, lon: 79.9828, town: true },
  { name: 'Kalutara', match: ['kalutara', 'wadduwa'], lat: 6.5854, lon: 79.9607, town: true },
  // Rainforest and gems
  { name: 'Sinharaja', match: ['sinharaja'], lat: 6.4, lon: 80.5, town: true },
  { name: 'Ratnapura', match: ['ratnapura'], lat: 6.6828, lon: 80.3992, town: true },
  // East coast
  { name: 'Trincomalee', match: ['trincomalee', 'nilaveli', 'uppuveli', 'pigeon island', 'koneswaram'], lat: 8.5874, lon: 81.2152, town: true },
  { name: 'Pasikudah', match: ['pasikudah', 'passikudah', 'pasikuda', 'kalkudah'], lat: 7.9277, lon: 81.563, town: true },
  { name: 'Batticaloa', match: ['batticaloa'], lat: 7.731, lon: 81.6747, town: true },
  { name: 'Arugam Bay', match: ['arugam'], lat: 6.8406, lon: 81.8368, town: true },
  { name: 'Kumana', match: ['kumana'], lat: 6.55, lon: 81.7 },
  { name: 'Gal Oya', match: ['gal oya'], lat: 7.22, lon: 81.4, town: true },
]

export type GeoPoint = { name: string; lat: number; lon: number }

/** Matches, longest first, so "Galle Face" wins over "Galle" and "Little Adam's" over "Adam's". */
const MATCHERS = GAZETTEER.flatMap((place) => place.match.map((token) => ({ token, place }))).sort(
  (a, b) => b.token.length - a.token.length
)

function normText(text: string) {
  return ` ${text.toLowerCase().replace(/[’`]/g, "'").replace(/[^a-z' ]+/g, ' ').replace(/\s+/g, ' ')} `
}

/** Every known place a line names, in the order it names them. */
export function placesIn(text: string | null | undefined, opts?: { townsOnly?: boolean }): GeoPoint[] {
  let hay = normText(text || '')
  const found: { pos: number; place: GeoPlace }[] = []
  for (const { token, place } of MATCHERS) {
    if (opts?.townsOnly && !place.town) continue
    const needle = ` ${token} `
    let pos = hay.indexOf(needle)
    while (pos >= 0) {
      found.push({ pos, place })
      // Blank the hit so a shorter token inside it ("galle" in "galle face") cannot match again.
      hay = hay.slice(0, pos + 1) + ' '.repeat(token.length) + hay.slice(pos + 1 + token.length)
      pos = hay.indexOf(needle)
    }
  }
  const seen = new Set<string>()
  return found
    .sort((a, b) => a.pos - b.pos)
    .filter(({ place }) => (seen.has(place.name) ? false : (seen.add(place.name), true)))
    .map(({ place }) => ({ name: place.name, lat: place.lat, lon: place.lon }))
}

/** The town a day ends in: the last town its overnight or location field names ("Ella to Yala" is Yala). */
export function townFor(text: string | null | undefined): GeoPoint | null {
  const towns = placesIn(text, { townsOnly: true })
  return towns.length ? towns[towns.length - 1] : null
}

export function km(a: GeoPoint, b: GeoPoint) {
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLon = (b.lon - a.lon) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(h))
}

const AIRPORT: GeoPoint = { name: 'Colombo Airport', lat: 7.1808, lon: 79.8841 }
/** Towns closer than this count as the same base (Sigiriya and Dambulla, Mirissa and Weligama). */
const SAME_BASE_KM = 25
/** A stay day's sights should sit within about an hour of the base. */
const STAY_RADIUS_KM = 45
const isAirportBelt = (p: GeoPoint) => km(p, AIRPORT) < 40

type RouteDay = {
  day?: number
  location?: string
  overnight_location?: string
  activities?: string[]
  optional_activities?: string[]
  travel?: { from?: string; to?: string }
}

export type RouteIssue = { day: number | null; kind: 'revisit' | 'zigzag' | 'off-route' | 'out-of-order' | 'far-day-trip'; message: string }

/** Where each day starts and ends, carrying the last known town forward. */
export function dayLegs(days: RouteDay[]) {
  const legs: { from: GeoPoint; to: GeoPoint }[] = []
  let prev: GeoPoint = townFor(days[0]?.travel?.from) || AIRPORT
  for (const d of days) {
    const to = townFor(d.overnight_location) || townFor(d.location) || townFor(d.travel?.to) || prev
    legs.push({ from: prev, to })
    prev = to
  }
  return legs
}

/** Position of p along the road from a to b: 0 at a, 1 at b. */
function along(a: GeoPoint, b: GeoPoint, p: GeoPoint) {
  const total = km(a, b)
  if (total < 1) return 0
  return (km(a, p) ** 2 - km(b, p) ** 2 + total ** 2) / (2 * total * total)
}

function detourKm(a: GeoPoint, b: GeoPoint, p: GeoPoint) {
  return km(a, p) + km(p, b) - km(a, b)
}

/** How far off the day's road a detour may go before it reads as doubling back. */
const allowedDetour = (legKm: number) => Math.max(25, legKm * 0.3)

/** The place an activity is about, ignoring the day's own start and end towns when it names something else. */
function activityPlace(line: string, leg: { from: GeoPoint; to: GeoPoint }): GeoPoint | null {
  const places = placesIn(line)
  if (!places.length) return null
  const others = places.filter((p) => km(p, leg.from) > 3 && km(p, leg.to) > 3)
  if (others.length) return others[0]
  // Only the day's own towns are named: the line is at the start or the end of the drive.
  return places[places.length - 1]
}

/** Legs shorter than this are a day around one base (or a short hop), not a drive with a direction. */
const TRANSFER_KM = SAME_BASE_KM

function checkStops(lines: string[], leg: { from: GeoPoint; to: GeoPoint }) {
  const legKm = km(leg.from, leg.to)
  const transfer = legKm >= TRANSFER_KM
  return lines.map((line) => {
    const p = activityPlace(line, leg)
    if (!p) return { line, place: null, t: null, off: false }
    // Anything around tonight's base or this morning's base belongs to the day, as does the airport on a flight day.
    const nearEnds = km(leg.to, p) <= STAY_RADIUS_KM || km(leg.from, p) <= STAY_RADIUS_KM
    const airportDay = isAirportBelt(leg.to) && isAirportBelt(p)
    if (!transfer) return { line, place: p, t: null, off: !nearEnds && !airportDay }
    const off = !nearEnds && !airportDay && detourKm(leg.from, leg.to, p) > allowedDetour(legKm)
    // Kelaniya on the way from Negombo to Kandy sits near the start, but behind it: that is still doubling back.
    const behind = km(leg.from, p) <= STAY_RADIUS_KM && along(leg.from, leg.to, p) < -0.15 && km(leg.to, p) > STAY_RADIUS_KM
    return { line, place: p, t: Math.min(1.2, Math.max(-0.2, along(leg.from, leg.to, p))), off: off || behind }
  })
}

/** True when a transfer day's stops go backwards along the road (by more than a few minutes of driving). */
function outOfOrder(checked: ReturnType<typeof checkStops>, legKm: number) {
  const slack = Math.max(0.15, 12 / Math.max(1, legKm))
  const ts = checked.filter((c) => c.t != null && !c.off).map((c) => c.t as number)
  return ts.some((t, j) => j > 0 && t < Math.max(...ts.slice(0, j)) - slack)
}

/** Length of the overnight sequence, airport to airport. */
function pathKm(points: GeoPoint[]) {
  const all = [AIRPORT, ...points, AIRPORT]
  let total = 0
  for (let i = 1; i < all.length; i++) total += km(all[i - 1], all[i])
  return total
}

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items]
  return items.flatMap((item, i) => permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest]))
}

/** The shortest order through the middle bases, keeping an airport-belt first and last base in place. */
function bestOrder(bases: GeoPoint[]): GeoPoint[] {
  const head = bases.length > 1 && isAirportBelt(bases[0]) ? [bases[0]] : []
  const tail = bases.length > 1 && isAirportBelt(bases[bases.length - 1]) ? [bases[bases.length - 1]] : []
  const middle = bases.slice(head.length, bases.length - tail.length)
  if (middle.length > 8) return bases
  let best = bases
  let bestKm = Infinity
  for (const order of permutations(middle)) {
    const candidate = [...head, ...order, ...tail]
    const length = pathKm(candidate)
    // Equal loops run either way round: keep the direction closest to what was written.
    const drift = candidate.reduce((sum, p, i) => sum + Math.abs(bases.indexOf(p) - i), 0)
    const score = length + drift * 0.01
    if (score < bestKm) {
      bestKm = score
      best = candidate
    }
  }
  return best
}

/** Overnight bases in order, merging consecutive nights in the same base. */
function basesOf(days: RouteDay[]) {
  const legs = dayLegs(days)
  const bases: { place: GeoPoint; firstDay: number; lastDay: number }[] = []
  legs.forEach((leg, i) => {
    const last = bases[bases.length - 1]
    if (last && km(last.place, leg.to) < SAME_BASE_KM) last.lastDay = i + 1
    else bases.push({ place: leg.to, firstDay: i + 1, lastDay: i + 1 })
  })
  return bases
}

/**
 * Everything that makes the journey double back: returning to a base already left, an overnight
 * order much longer than the obvious sweep, stops behind the car or far off the day's road.
 */
export function checkRoute(days: RouteDay[]): { ok: boolean; issues: RouteIssue[]; suggestedOrder: string[] | null } {
  const issues: RouteIssue[] = []
  const bases = basesOf(days)

  bases.forEach((base, i) => {
    const earlier = bases.slice(0, i).find((b) => km(b.place, base.place) < SAME_BASE_KM)
    const bookend = i === bases.length - 1 && isAirportBelt(base.place) && isAirportBelt(bases[0].place)
    if (earlier && !bookend) {
      issues.push({
        day: base.firstDay,
        kind: 'revisit',
        message: `Day ${base.firstDay} goes back to ${base.place.name}, which the journey already left after day ${earlier.lastDay}.`,
      })
    }
  })

  let suggestedOrder: string[] | null = null
  const points = bases.map((b) => b.place)
  // Merge a revisited base into its first visit before looking for the shortest sweep.
  const unique = points.filter((p, i) => i === points.length - 1 || !points.slice(0, i).some((q) => km(q, p) < SAME_BASE_KM))
  const best = bestOrder(unique)
  const actual = pathKm(points)
  const shortest = pathKm(best)
  if (actual > shortest * 1.2 && actual - shortest > 60) {
    suggestedOrder = best.map((p) => p.name).filter((name, i, all) => name !== all[i - 1])
    issues.push({
      day: null,
      kind: 'zigzag',
      message: `The overnight order ${points.map((p) => p.name).join(', ')} criss-crosses the island (about ${Math.round(actual - shortest)} km more than needed). Sweep in one direction: ${suggestedOrder.join(', ')}.`,
    })
  }

  const legs = dayLegs(days)
  days.forEach((d, i) => {
    const leg = legs[i]
    const transfer = km(leg.from, leg.to) >= TRANSFER_KM
    const checked = checkStops(d.activities || [], leg)
    for (const c of checked) {
      if (!c.off || !c.place) continue
      issues.push({
        day: i + 1,
        kind: transfer ? 'off-route' : 'far-day-trip',
        message: transfer
          ? `Day ${i + 1} (${leg.from.name} to ${leg.to.name}): ${c.place.name} is off that road or behind the car. Use a stop that lies between ${leg.from.name} and ${leg.to.name}.`
          : `Day ${i + 1} is based in ${leg.to.name}, but ${c.place.name} is about ${Math.round(km(leg.to, c.place))} km away. Pick something near ${leg.to.name}.`,
      })
    }
    if (transfer && outOfOrder(checked, km(leg.from, leg.to))) {
      issues.push({
        day: i + 1,
        kind: 'out-of-order',
        message: `Day ${i + 1} (${leg.from.name} to ${leg.to.name}) lists stops out of driving order. List them in the order the car reaches them.`,
      })
    }
  })

  return { ok: issues.length === 0, issues, suggestedOrder }
}

/**
 * The safe fixes code can make without rewriting the story: on transfer days, stops go in the
 * order the car reaches them, and stops far off the road are removed (padding then refills a
 * thin day with stops that are on the road).
 */
export function fixDayOrder<T extends RouteDay>(days: T[]): T[] {
  const legs = dayLegs(days)
  return days.map((d, i) => {
    const leg = legs[i]
    const activities = d.activities || []
    const optional = d.optional_activities || []
    const optionalNear = optional.filter((line) => !checkStops([line], leg)[0].off)
    if (!activities.length) return optionalNear.length === optional.length ? d : { ...d, optional_activities: optionalNear }
    const checked = checkStops(activities, leg)
    const keep = checked.filter((c) => !c.off)
    const kept = keep.length > 0 ? keep : checked
    let ordered = kept
    if (km(leg.from, leg.to) >= TRANSFER_KM && outOfOrder(kept, km(leg.from, leg.to))) {
      // Lines without a place keep the position of the placed line before them.
      let lastT = -1
      const keyed = kept.map((c, idx) => {
        if (c.t != null && !c.off) lastT = c.t
        return { c, idx, t: c.t != null && !c.off ? c.t : lastT }
      })
      ordered = keyed.sort((a, b) => a.t - b.t || a.idx - b.idx).map((k) => k.c)
    }
    const nextActivities = ordered.map((c) => c.line)
    const same = nextActivities.length === activities.length && nextActivities.every((l, j) => l === activities[j])
    if (same && optionalNear.length === optional.length) return d
    return { ...d, activities: nextActivities, optional_activities: optionalNear }
  })
}

/** One day's lines in driving order, when they go backwards; nothing is removed. */
export function orderDayLines(lines: string[], day: RouteDay, prevTown?: GeoPoint | null): string[] {
  const to = townFor(day.overnight_location) || townFor(day.location)
  const from = townFor(day.travel?.from) || prevTown || to
  if (!to || !from || km(from, to) < TRANSFER_KM) return lines
  const checked = checkStops(lines, { from, to })
  if (!outOfOrder(checked, km(from, to))) return lines
  let lastT = -1
  return checked
    .map((c, idx) => {
      if (c.t != null && !c.off) lastT = c.t
      return { line: c.line, idx, t: c.t != null && !c.off ? c.t : lastT }
    })
    .sort((a, b) => a.t - b.t || a.idx - b.idx)
    .map((k) => k.line)
}

/** True when a padding stop sits on (or near) the day's road. */
export function stopFitsDay(name: string, day: RouteDay, prevTown?: GeoPoint | null): boolean {
  const to = townFor(day.overnight_location) || townFor(day.location)
  const from = townFor(day.travel?.from) || prevTown || to
  if (!to || !from) return true
  const [c] = checkStops([name], { from, to })
  return !c.off
}

/** Short plain-language notes for a retry prompt. */
export function routeFeedback(report: ReturnType<typeof checkRoute>): string {
  if (report.ok) return ''
  const lines = report.issues.slice(0, 10).map((issue) => `- ${issue.message}`)
  return `ROUTE CHECK FAILED. LankaLux journeys never double back. Rewrite the whole itinerary as JSON, fixing these:\n${lines.join('\n')}\nKeep the same number of days, the same voice and everything else that was right.`
}
