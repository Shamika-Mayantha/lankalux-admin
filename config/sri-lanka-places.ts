/**
 * LankaLux place intelligence for itinerary generation.
 * Named stops a chauffeur-guided journey can weave in — overnight towns
 * plus the worthwhile pauses that sit on the actual road between them.
 *
 * This is original LankaLux routing knowledge. Do not paste competitor copy.
 */

export type PlaceKind = 'en_route' | 'in_place' | 'optional'

export type PlaceStop = {
  name: string
  note: string
  kind: PlaceKind
}

export type RegionId =
  | 'colombo'
  | 'cultural-triangle'
  | 'kandy'
  | 'tea-country'
  | 'ella'
  | 'yala'
  | 'south-coast'
  | 'west-coast'

export type RegionGuide = {
  id: RegionId
  title: string
  match: string[]
  overnight: string
  stops: PlaceStop[]
}

export type CorridorGuide = {
  id: string
  from: RegionId
  to: RegionId
  drive: string
  stops: PlaceStop[]
}

export const REGIONS: RegionGuide[] = [
  {
    id: 'colombo',
    title: 'Colombo & airport belt',
    match: ['colombo', 'airport', 'katunayake', 'negombo', 'arrival', 'departure'],
    overnight: 'Colombo or Negombo only when the flight timing needs it',
    stops: [
      { name: 'Gangaramaya Temple', note: 'Living city temple — architecture, courtyard and a short cultural pause, not a rushed photo stop.', kind: 'in_place' },
      { name: 'Viharamahadevi Park & Green Path', note: 'Shade, local painters and an easy first walk after a long flight.', kind: 'in_place' },
      { name: 'Pettah & the Jami Ul-Alfar Mosque', note: 'Colour, spice streets and the red-and-white mosque if energy allows.', kind: 'in_place' },
      { name: 'Independence Square Arcade', note: 'Colonial lawns and a calm coffee stop before heading up-country.', kind: 'optional' },
      { name: 'Galle Face Green', note: 'Sea breeze and the old parliament façade at golden hour.', kind: 'in_place' },
      { name: 'Kelaniya Raja Maha Vihara', note: 'Painted shrine on the way out of the city toward the north road.', kind: 'en_route' },
    ],
  },
  {
    id: 'cultural-triangle',
    title: 'Cultural Triangle (Sigiriya, Dambulla, Habarana)',
    match: ['sigiriya', 'sigirya', 'dambulla', 'habarana', 'polonnaruwa', 'cultural triangle', 'anuradhapura', 'pidurangala', 'minneriya', 'kaudulla'],
    overnight: 'Sigiriya, Dambulla or Habarana',
    stops: [
      { name: 'Sigiriya Rock Fortress', note: 'The day’s centrepiece. Allow a proper morning — frescoes, lion’s paw and the summit view.', kind: 'in_place' },
      { name: 'Pidurangala', note: 'Quieter sister rock. Better sunrise or sunset if they skip the main climb.', kind: 'optional' },
      { name: 'Dambulla Cave Temple', note: 'Five cave shrines with painted ceilings — often the last hour of the drive from Colombo.', kind: 'in_place' },
      { name: 'Village tank & home cookery', note: 'A real rural welcome: paddy paths, a catamaran on the tank, lunch in a family kitchen. Keep it unscripted.', kind: 'in_place' },
      { name: 'Minneriya or Kaudulla', note: 'Seasonal wild elephants on the tanks. Choose the park that is gathering that month — never both in one afternoon.', kind: 'optional' },
      { name: 'Polonnaruwa', note: 'Half-day of galleries and reclining Buddha if the stay is two nights.', kind: 'optional' },
      { name: 'Hurulu Eco Park', note: 'A quieter tank-edge jeep if Minneriya is crowded — still wild elephants, fewer vehicles.', kind: 'optional' },
      { name: 'Kaludiya Pokuna', note: 'Forest monastery ruins near Dambulla; a short, almost empty walk.', kind: 'en_route' },
      { name: 'Mihintale', note: 'The stair and white dagoba above Anuradhapura if the stay stretches north.', kind: 'optional' },
    ],
  },
  {
    id: 'kandy',
    title: 'Kandy',
    match: ['kandy', 'tooth', 'peradeniya', 'knuckles', 'ambuluwawa'],
    overnight: 'Kandy',
    stops: [
      { name: 'Temple of the Tooth Relic', note: 'The living heart of the city. Time it around a puja if the schedule allows.', kind: 'in_place' },
      { name: 'Kandy Lake loop', note: 'A slow walk beside the water after the temple — shade, birds, city pace.', kind: 'in_place' },
      { name: 'Udawattakele Sanctuary', note: 'A green pocket above the lake if they want forest rather than more temples.', kind: 'optional' },
      { name: 'Bahirawakanda viewpoint', note: 'Short stop for the white Buddha over the rooftops.', kind: 'optional' },
      { name: 'Kandy market', note: 'Fruit, spices and everyday city life — ten to twenty minutes, not a shopping tour.', kind: 'in_place' },
      { name: 'Kandyan dance performance', note: 'An evening cultural show if they enjoy music; skip if the day was already long.', kind: 'optional' },
      { name: 'Ambuluwawa Tower', note: 'Spiral white tower and hill views toward Gampola — experience days only, not for rushed stays.', kind: 'optional' },
      { name: 'Embekke Devale', note: 'Carved wooden pillars in a quiet village shrine south-west of Kandy.', kind: 'optional' },
      { name: 'Gadaladeniya & Lankatilaka', note: 'A pair of hill temples on the same loop as Embekke — pick one if time is short.', kind: 'optional' },
    ],
  },
  {
    id: 'tea-country',
    title: 'Tea country (Nuwara Eliya, Ramboda, Nanu Oya)',
    match: ['nuwara eliya', 'nuwaraeliya', 'little england', 'horton', 'hakgala', 'gregory', 'ramboda', 'nanu oya', 'tea'],
    overnight: 'Nuwara Eliya or a tea bungalow nearby',
    stops: [
      { name: 'Horton Plains & World’s End', note: 'Only with a pre-dawn start and clear weather. Skip rather than rush.', kind: 'optional' },
      { name: 'Hakgala Botanical Garden', note: 'Cool montane garden beneath the peak — unhurried walking.', kind: 'in_place' },
      { name: 'Seetha Amman Temple', note: 'A small hillside shrine tied to the Ramayana story; a short, respectful visit.', kind: 'in_place' },
      { name: 'Working tea factory', note: 'One estate only — walk the rows, watch withering and rolling, sit down for a proper cup.', kind: 'in_place' },
      { name: 'Strawberry garden', note: 'A light, family-friendly pause for fruit and a view. Not a full afternoon.', kind: 'optional' },
      { name: 'Gregory Lake & park', note: 'Boat, lawn and the hill-station promenade at the end of the day.', kind: 'in_place' },
      { name: 'Ambewela dairy country', note: 'Open pasture and cool air on the road south of town if they have spare time.', kind: 'optional' },
      { name: 'Moon Plains', note: 'A 360-degree hill-country lookout above town — short walk, wide sky.', kind: 'in_place' },
      { name: 'Lover’s Leap Falls', note: 'A hidden cascade on the edge of Nuwara Eliya; ten minutes from the car.', kind: 'in_place' },
    ],
  },
  {
    id: 'ella',
    title: 'Ella & Demodara',
    match: ['ella', 'nine arch', 'nine arches', 'demodara', 'ravana', 'little adam', 'ella rock', 'bandarawela'],
    overnight: 'Ella or Bandarawela',
    stops: [
      { name: 'Nine Arches Bridge', note: 'Time the visit to a passing train if you can. Walk the track approach rather than only the roadside lookout.', kind: 'in_place' },
      { name: 'Little Adam’s Peak', note: 'Forty-five minutes up, wide Ella Gap views. Prefer this over Ella Rock on a transfer day.', kind: 'in_place' },
      { name: 'Ella Rock', note: 'Longer hike (2–3 hours). One hike per stay — do not stack both peaks.', kind: 'optional' },
      { name: 'Ravana Falls', note: 'Roadside cascade on the way into or out of Ella; a swim only if the flow is kind.', kind: 'en_route' },
      { name: 'Ella Gap viewpoint', note: 'The drop toward the southern plains — a two-minute pull-over that earns the drive.', kind: 'en_route' },
      { name: 'Hill-country tea trail', note: 'A short walk through bushes above town, not a second factory tour.', kind: 'optional' },
      { name: 'Dowa Rock Temple', note: 'Unfinished Buddha carved into a cliff between Bandarawela and Ella.', kind: 'en_route' },
      { name: 'Lipton’s Seat', note: 'Dawn lookout above Haputale if they overnight nearby; skip on a tight Ella transfer.', kind: 'optional' },
      { name: 'Diyaluma Falls', note: 'Sri Lanka’s second-highest fall, a short detour off the Wellawaya road.', kind: 'en_route' },
    ],
  },
  {
    id: 'yala',
    title: 'Yala, Tissa & the dry south-east',
    match: ['yala', 'tissa', 'tissamaharama', 'kataragama', 'leopard', 'safari', 'bundala', 'udawalawe'],
    overnight: 'Tissamaharama, Yala buffer or Kataragama',
    stops: [
      { name: 'Yala National Park', note: 'One well-timed jeep (dawn preferred). Do not stack two parks in a single day.', kind: 'in_place' },
      { name: 'Tissa lakes', note: 'Storks, lilies and a quiet circuit if the safari finished early.', kind: 'optional' },
      { name: 'Kataragama', note: 'An evening at the shrine if the party is curious about living pilgrimage.', kind: 'optional' },
      { name: 'Buduruwagala', note: 'Forest Buddhas on the Ella–Wellawaya road; fifteen quiet minutes.', kind: 'en_route' },
      { name: 'Bundala', note: 'Bird-first lagoon park — a gentler alternative or add-on to Yala.', kind: 'optional' },
      { name: 'Udawalawe', note: 'Elephant country on the hill-to-coast road. Use it when the route already passes, not as a detour.', kind: 'optional' },
    ],
  },
  {
    id: 'south-coast',
    title: 'South coast (Mirissa, Weligama, Galle, Unawatuna)',
    match: ['mirissa', 'weligama', 'galle', 'unawatuna', 'tangalle', 'hiriketiya', 'koggala', 'whale', 'stilt'],
    overnight: 'Mirissa, Weligama, Galle or Unawatuna',
    stops: [
      { name: 'Galle Fort', note: 'Rampart walk, lighthouse and quiet courts. Give it a proper afternoon, not a drive-by.', kind: 'in_place' },
      { name: 'Mirissa or Weligama bay', note: 'Beach time, coconut-tree hill or a surf lesson — pick one rhythm, not all three.', kind: 'in_place' },
      { name: 'Whale watching (seasonal)', note: 'Only in season, with an early start. Skip if seas are rough or the party is young.', kind: 'optional' },
      { name: 'Koggala lagoon & folklore museum', note: 'A calmer water afternoon than jet-skis, with a glimpse of southern literary history.', kind: 'optional' },
      { name: 'Hummanaya blowhole', note: 'A five-minute roadside wonder between Yala and Tangalle when swell is up.', kind: 'en_route' },
      { name: 'Mulkirigala Rock Temple', note: 'Cave murals on a laterite stair — a cultured pause on the same south-east road.', kind: 'en_route' },
      { name: 'Weligama stilt fishermen', note: 'The iconic pose at first light — a respectful photo stop, not a performance.', kind: 'in_place' },
      { name: 'Japanese Peace Pagoda, Unawatuna', note: 'White stupa above Jungle Beach with a bay view.', kind: 'optional' },
      { name: 'Rumassala & Jungle Beach', note: 'A short forest walk to a hidden cove if they want sea without the main strip.', kind: 'optional' },
    ],
  },
  {
    id: 'west-coast',
    title: 'South-west coast (Bentota, Kosgoda, Madu Ganga)',
    match: ['bentota', 'kosgoda', 'madu', 'balapitiya', 'hikkaduwa', 'brief garden', 'lunuganga', 'turtle'],
    overnight: 'Bentota, Balapitiya or a Galle–Colombo coast hotel',
    stops: [
      { name: 'Kosgoda turtle hatchery', note: 'Choose a conservation-minded project. Watch, learn, no handling shows.', kind: 'en_route' },
      { name: 'Madu Ganga mangrove boat', note: 'Cinnamon island channels north of Galle — a slow hour on the water.', kind: 'in_place' },
      { name: 'Brief Garden or Lunuganga', note: 'Bawa landscapes for design-minded guests. One garden, not both.', kind: 'optional' },
      { name: 'Bentota water-sports', note: 'River and sea toys only if the party asked for them. Never the default for a luxury family day.', kind: 'optional' },
      { name: 'Kande Vihara', note: 'Hilltop Buddha above Bentota if they want a temple with a view.', kind: 'optional' },
    ],
  },
]

export const CORRIDORS: CorridorGuide[] = [
  {
    id: 'colombo-triangle',
    from: 'colombo',
    to: 'cultural-triangle',
    drive: 'Airport or Colombo to Sigiriya / Dambulla — roughly 3.5–4.5 hours of road time, plus stops',
    stops: [
      { name: 'Kelaniya Temple', note: 'If leaving from the city rather than the airport.', kind: 'en_route' },
      { name: 'Ethical elephant encounter', note: 'A viewing-only conservation stop on the Kegalle corridor if it fits the party. No riding, no bathing shows.', kind: 'en_route' },
      { name: 'Matale spice garden', note: 'Walk and tasting on the last hour into the triangle — keep it educational, not a hard sell.', kind: 'en_route' },
      { name: 'Aluvihara Rock Temple', note: 'Cave monastery where the Tripitaka was first written down. Ten to twenty minutes.', kind: 'en_route' },
      { name: 'Nalanda Gedige', note: 'A small stone shrine at the crossroads — a stretch-the-legs photo stop.', kind: 'en_route' },
      { name: 'Dambulla Cave Temple', note: 'Arrive here at the end of the drive and overnight nearby, rather than saving it for a rushed morning.', kind: 'en_route' },
    ],
  },
  {
    id: 'triangle-kandy',
    from: 'cultural-triangle',
    to: 'kandy',
    drive: 'Sigiriya / Dambulla to Kandy — about 2.5–3 hours plus pauses',
    stops: [
      { name: 'Dambulla Cave Temple', note: 'If it was not visited on arrival day.', kind: 'en_route' },
      { name: 'Nalanda Gedige', note: 'On the A9, a brief architectural curiosity.', kind: 'en_route' },
      { name: 'Matale spice & kovil stretch', note: 'Spice walk and the colourful Hindu kovil if they skipped it northbound.', kind: 'en_route' },
      { name: 'Royal Botanic Gardens, Peradeniya', note: 'The last hour into Kandy. Orchids, avenues and a long lunch in the shade.', kind: 'en_route' },
    ],
  },
  {
    id: 'kandy-tea',
    from: 'kandy',
    to: 'tea-country',
    drive: 'Kandy to Nuwara Eliya — about 2.5–3 hours of climbing road',
    stops: [
      { name: 'Gampola valley views', note: 'Pull overs as the road lifts into tea.', kind: 'en_route' },
      { name: 'Ramboda Falls', note: 'The cascade beside the hairpins — the signature pause of this drive.', kind: 'en_route' },
      { name: 'Sri Bhakta Hanuman Temple, Ramboda', note: 'Hilltop shrine with a wide valley view. Short, respectful visit.', kind: 'en_route' },
      { name: 'Labukele or Glenloch tea factory', note: 'One working factory on the climb. Sit for tea; do not stack a second estate the same afternoon.', kind: 'en_route' },
      { name: 'Kotmale reservoir lookout', note: 'A quiet dam view if timing is easy.', kind: 'optional' },
    ],
  },
  {
    id: 'tea-ella',
    from: 'tea-country',
    to: 'ella',
    drive: 'Nuwara Eliya to Ella — road about 1.5–2 hours, or the Nanu Oya–Ella train',
    stops: [
      { name: 'Nanu Oya to Ella train', note: 'When tickets exist, this is the day’s gift. Vehicle meets the party at Ella station.', kind: 'en_route' },
      { name: 'Ella Gap viewpoint', note: 'The first look down to the south.', kind: 'en_route' },
      { name: 'Nine Arches Bridge', note: 'On arrival in Demodara / Ella.', kind: 'en_route' },
      { name: 'Rawana Falls', note: 'The roadside veil just before town.', kind: 'en_route' },
      { name: 'Diyaluma Falls', note: 'A taller cascade on the descent toward Wellawaya if the route heads south-east.', kind: 'en_route' },
    ],
  },
  {
    id: 'ella-yala',
    from: 'ella',
    to: 'yala',
    drive: 'Ella to Tissa / Yala — about 2.5–3.5 hours descending to the plains',
    stops: [
      { name: 'Wellawaya plains', note: 'The landscape shift from tea to dry zone — worth naming in the day copy.', kind: 'en_route' },
      { name: 'Buduruwagala', note: 'Forest Buddhas off the Wellawaya road.', kind: 'en_route' },
      { name: 'Diyaluma Falls', note: 'Upper pools and the big drop — worth the short walk if they have an hour.', kind: 'en_route' },
      { name: 'Rawana already done in Ella', note: 'Do not repeat the falls if they were visited yesterday.', kind: 'optional' },
    ],
  },
  {
    id: 'ella-south',
    from: 'ella',
    to: 'south-coast',
    drive: 'Ella toward Galle / Mirissa — a long south-west day; pad with one nature stop, not five',
    stops: [
      { name: 'Udawalawe', note: 'A morning jeep only if wildlife is a stated interest and the drive already passes.', kind: 'en_route' },
      { name: 'Tangalle or Hiriketiya pause', note: 'A swim and lunch if the coast overnight is further west.', kind: 'en_route' },
    ],
  },
  {
    id: 'yala-south',
    from: 'yala',
    to: 'south-coast',
    drive: 'Yala to Mirissa / Galle — coastal road with a few genuine pauses',
    stops: [
      { name: 'Bundala lagoons', note: 'Birds and salt pans if they want a gentler morning after safari.', kind: 'en_route' },
      { name: 'Hummanaya blowhole', note: 'When the swell cooperates.', kind: 'en_route' },
      { name: 'Mulkirigala Rock Temple', note: 'A cultured stair-climb before the beach days begin.', kind: 'en_route' },
    ],
  },
  {
    id: 'south-west',
    from: 'south-coast',
    to: 'west-coast',
    drive: 'Galle / Mirissa toward Bentota and the airport road',
    stops: [
      { name: 'Galle Fort', note: 'If it was not a stay-day already.', kind: 'en_route' },
      { name: 'Kosgoda turtles', note: 'Conservation hatchery on the coast road.', kind: 'en_route' },
      { name: 'Madu Ganga boat', note: 'Mangrove hour before the final hotel or the airport run.', kind: 'en_route' },
    ],
  },
  {
    id: 'west-airport',
    from: 'west-coast',
    to: 'colombo',
    drive: 'Bentota / Galle coast to Bandaranaike Airport — about 1.5–2.5 hours',
    stops: [
      { name: 'Madu Ganga or Kosgoda', note: 'Only if they were not done the day before. Keep the last morning light.', kind: 'en_route' },
      { name: 'Colombo city', note: 'Only for a late flight. Otherwise go straight to the airport.', kind: 'optional' },
    ],
  },
]

const CLASSIC_REGION_IDS: RegionId[] = [
  'colombo',
  'cultural-triangle',
  'kandy',
  'tea-country',
  'ella',
  'yala',
  'south-coast',
  'west-coast',
]

function haystackOf(parts: Array<string | null | undefined>): string {
  return parts
    .filter(Boolean)
    .join(' · ')
    .toLowerCase()
}

function expandAlongClassicLine(hit: RegionGuide[]): RegionGuide[] {
  const ids = new Set(hit.map((region) => region.id))
  const indices = CLASSIC_REGION_IDS.map((id, index) => (ids.has(id) ? index : -1)).filter((index) => index >= 0)
  if (indices.length >= 2) {
    const min = Math.min(...indices)
    const max = Math.max(...indices)
    for (let index = min; index <= max; index += 1) {
      ids.add(CLASSIC_REGION_IDS[index])
    }
  }
  // Airport is almost always the bookend. Include Colombo as a place menu
  // without stretching a south-only trip all the way through the triangle.
  ids.add('colombo')
  return REGIONS.filter((region) => ids.has(region.id))
}

export function matchRegions(text: string, opts?: { expand?: boolean }): RegionGuide[] {
  const hay = text.toLowerCase()
  const hit = REGIONS.filter((region) => region.match.some((token) => hay.includes(token)))
  if (opts?.expand === false) return hit
  const base = hit.length ? hit : REGIONS.filter((region) => CLASSIC_REGION_IDS.includes(region.id))
  return expandAlongClassicLine(base)
}

export function matchCorridors(regions: RegionGuide[]): CorridorGuide[] {
  const ids = new Set(regions.map((region) => region.id))
  return CORRIDORS.filter((corridor) => ids.has(corridor.from) && ids.has(corridor.to))
}

export function placesForJourney(opts: {
  destinations?: string | null
  interests?: string | null
  notes?: string | null
}): { regions: RegionGuide[]; corridors: CorridorGuide[] } {
  const hay = haystackOf([opts.destinations, opts.interests, opts.notes])
  const regions = matchRegions(hay)
  return { regions, corridors: matchCorridors(regions) }
}

function formatStops(stops: PlaceStop[]): string {
  return stops
    .map((stop) => {
      const tag = stop.kind === 'en_route' ? 'en route' : stop.kind === 'optional' ? 'optional' : 'in place'
      return `  - [${tag}] ${stop.name} — ${stop.note}`
    })
    .join('\n')
}

export function formatPlacesCatalog(regions: RegionGuide[], corridors: CorridorGuide[]): string {
  const regionBlock = regions
    .map((region) => `REGION ${region.title}\nOvernight: ${region.overnight}\n${formatStops(region.stops)}`)
    .join('\n\n')
  const corridorBlock = corridors
    .map((corridor) => `DRIVE ${corridor.drive}\n${formatStops(corridor.stops)}`)
    .join('\n\n')
  return [regionBlock, corridorBlock].filter(Boolean).join('\n\n')
}

export const MIN_DAY_ACTIVITIES = 4

export function stopsForDay(day: {
  location?: string
  overnight_location?: string
  title?: string
  travel?: { from?: string; to?: string }
}): PlaceStop[] {
  const here = haystackOf([day.location, day.overnight_location, day.title])
  const fromText = haystackOf([day.travel?.from, day.location])
  const toText = haystackOf([day.travel?.to, day.overnight_location, day.location])
  const hereRegions = matchRegions(here, { expand: false })
  const fromRegions = matchRegions(fromText, { expand: false })
  const toRegions = matchRegions(toText, { expand: false })
  const regionIds = new Set([...hereRegions, ...fromRegions, ...toRegions].map((region) => region.id))
  const regions = REGIONS.filter((region) => regionIds.has(region.id))
  const corridors = CORRIDORS.filter((corridor) => {
    const forward = fromRegions.some((r) => r.id === corridor.from) && toRegions.some((r) => r.id === corridor.to)
    const reverse = fromRegions.some((r) => r.id === corridor.to) && toRegions.some((r) => r.id === corridor.from)
    return forward || reverse
  })

  const seen = new Set<string>()
  const out: PlaceStop[] = []
  const push = (stop: PlaceStop) => {
    if (/already done/i.test(stop.name)) return
    const key = stop.name.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    out.push(stop)
  }
  for (const corridor of corridors) {
    for (const stop of corridor.stops) if (stop.kind === 'en_route') push(stop)
  }
  for (const region of regions) {
    for (const stop of region.stops) if (stop.kind === 'en_route') push(stop)
  }
  for (const region of regions) {
    for (const stop of region.stops) if (stop.kind === 'in_place') push(stop)
  }
  for (const corridor of corridors) {
    for (const stop of corridor.stops) push(stop)
  }
  for (const region of regions) {
    for (const stop of region.stops) push(stop)
  }
  return out
}

function mentionedIn(lines: string[], name: string) {
  const hay = lines.join(' · ').toLowerCase()
  const tokens = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter((token) => token.length > 3)
  if (!tokens.length) return hay.includes(name.toLowerCase().slice(0, 8))
  const hits = tokens.filter((token) => hay.includes(token)).length
  return hits >= Math.min(2, tokens.length)
}

function parseActivityMinutes(line: string): number | null {
  const match = line.match(/^(\d{1,2}):(\d{2})\s*([aApP][mM])?/)
  if (!match) return null
  let hour = Number(match[1])
  const minute = Number(match[2])
  const ampm = match[3]?.toUpperCase()
  if (ampm === 'PM' && hour < 12) hour += 12
  if (ampm === 'AM' && hour === 12) hour = 0
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null
  return hour * 60 + minute
}

function formatActivityClock(totalMinutes: number) {
  const wrapped = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60)
  const hour24 = Math.floor(wrapped / 60)
  const minute = wrapped % 60
  const suffix = hour24 >= 12 ? 'PM' : 'AM'
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12
  return `${hour12}:${String(minute).padStart(2, '0')} ${suffix}`
}

export function ensureMinimumDayActivities<T extends { activities: string[]; optional_activities?: string[]; location?: string; overnight_location?: string; title?: string; travel?: { from?: string; to?: string } }>(
  days: T[]
): T[] {
  return days.map((day) => {
    const activities = [...(day.activities || [])]
    if (activities.length >= MIN_DAY_ACTIVITIES) return day
    const used = [...activities, ...(day.optional_activities || [])]
    let cursor = 9 * 60
    for (const line of activities) {
      const mins = parseActivityMinutes(line)
      if (mins != null) cursor = Math.max(cursor, mins + 90)
    }
    for (const stop of stopsForDay(day)) {
      if (activities.length >= MIN_DAY_ACTIVITIES) break
      if (mentionedIn(used, stop.name)) continue
      const prefix = stop.kind === 'en_route' ? 'En route: ' : ''
      const note = stop.note.replace(/\s+/g, ' ').trim()
      const line = `${formatActivityClock(cursor)} - ${prefix}${stop.name}${note ? ` — ${note}` : ''}`
      activities.push(line)
      used.push(line)
      cursor += 90
    }
    return { ...day, activities }
  })
}
