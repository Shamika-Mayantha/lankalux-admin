import { stopsForDay, type PlaceStop } from '@/config/sri-lanka-places'
import type { ItineraryDay } from '@/types/domain'

export const TBC = 'TO BE CONFIRMED'

export type StopClassification = 'recommended' | 'optional' | 'if_time' | 'detour'
export type StopCategory =
  | 'Scenic viewpoint'
  | 'Tea stop'
  | 'Coffee stop'
  | 'Lunch area'
  | 'Temple'
  | 'Historical attraction'
  | 'Short cultural visit'
  | 'Photo stop'
  | 'Waterfall'
  | 'Local market'
  | 'Restroom / comfort stop'
  | 'Roadside viewpoint'

export type OperationalStop = {
  name: string
  note: string
  classification: StopClassification
  category: StopCategory
}

export type TrainOperation = {
  kind: 'train'
  boarding: string
  destination: string
  trainNumber: string
  trainTime: string
  notes: string[]
}

export type SafariOperation = {
  kind: 'safari'
  park: string
  start: string
  finish: string
  jeep: string
  wait: string
  reconnect: string
}

export type SpecialOperation = TrainOperation | SafariOperation

const DETOUR_RE =
  /\b(diyalyma|diyaluma|lipton'?s seat|horton plains|world'?s end|ambuluwawa|ella rock|mihintale)\b/i

function haystack(parts: Array<string | null | undefined | string[]>) {
  return parts
    .flat()
    .filter(Boolean)
    .join(' · ')
    .toLowerCase()
}

export function displayOrTbc(value: string | null | undefined) {
  const text = String(value || '').trim()
  return text || TBC
}

export function categoryForStop(name: string, note = ''): StopCategory {
  const text = `${name} ${note}`.toLowerCase()
  if (/tea|estate|factory|labukele|glenloch/.test(text)) return 'Tea stop'
  if (/coffee|cafe/.test(text)) return 'Coffee stop'
  if (/lunch|restaurant|meal/.test(text)) return 'Lunch area'
  if (/temple|kovil|vihara|dagoba|shrine|pagoda|tooth/.test(text)) return 'Temple'
  if (/fort|palace|ruins|museum|gedige|historical|heritage/.test(text)) return 'Historical attraction'
  if (/waterfall|falls|cascade/.test(text)) return 'Waterfall'
  if (/market|pettah|bazaar/.test(text)) return 'Local market'
  if (/restroom|comfort|stretch|water stop/.test(text)) return 'Restroom / comfort stop'
  if (/photo|nine arch|bridge|stilt/.test(text)) return 'Photo stop'
  if (/view|lookout|viewpoint|gap|plains|reservoir/.test(text)) return 'Scenic viewpoint'
  if (/spice|village|cultural|cookery|dance/.test(text)) return 'Short cultural visit'
  return 'Roadside viewpoint'
}

export function classifyStop(stop: PlaceStop): StopClassification {
  if (/detour/i.test(stop.note) || /detour/i.test(stop.name) || DETOUR_RE.test(stop.name)) return 'detour'
  if (stop.kind === 'en_route') return 'recommended'
  if (stop.kind === 'optional') return 'if_time'
  return 'optional'
}

export function classificationLabel(classification: StopClassification) {
  if (classification === 'recommended') return 'RECOMMENDED STOP'
  if (classification === 'optional') return 'OPTIONAL STOP'
  if (classification === 'if_time') return 'ONLY IF TIME ALLOWS'
  return 'DETOUR — confirm with LankaLux/guest before visiting.'
}

function alreadyPlanned(stop: PlaceStop, planned: string) {
  const name = stop.name.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').trim()
  const key = name.split(' ').filter((w) => w.length > 3).slice(0, 3).join(' ')
  return Boolean(key && planned.includes(key))
}

export function operationalStopsForDay(day: ItineraryDay): OperationalStop[] {
  const planned = haystack([day.title, day.description, day.activities, day.optional_activities])
  const catalog = stopsForDay({
    location: day.location,
    overnight_location: day.overnight_location,
    title: day.title,
    travel: day.travel,
  })
  const out: OperationalStop[] = []
  const seen = new Set<string>()
  const push = (stop: OperationalStop) => {
    const key = stop.name.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    out.push(stop)
  }

  for (const stop of catalog) {
    if (stop.kind !== 'en_route') continue
    if (alreadyPlanned(stop, planned)) continue
    push({
      name: stop.name,
      note: stop.note,
      classification: classifyStop(stop),
      category: categoryForStop(stop.name, stop.note),
    })
    if (out.filter((item) => item.classification === 'recommended').length >= 3) break
  }

  for (const stop of catalog) {
    if (stop.kind !== 'optional') continue
    if (alreadyPlanned(stop, planned)) continue
    if (DETOUR_RE.test(stop.name) || /detour/i.test(stop.note)) {
      push({
        name: stop.name,
        note: stop.note,
        classification: 'detour',
        category: categoryForStop(stop.name, stop.note),
      })
      continue
    }
    if (out.filter((item) => item.classification === 'if_time' || item.classification === 'optional').length >= 2) continue
    push({
      name: stop.name,
      note: stop.note,
      classification: 'if_time',
      category: categoryForStop(stop.name, stop.note),
    })
  }

  const isTransfer = Boolean(day.travel?.from && day.travel?.to && day.travel.from !== day.travel.to)
  if (isTransfer && !out.some((stop) => stop.category === 'Restroom / comfort stop')) {
    push({
      name: 'Recommended comfort stop',
      note: 'Stretch, restrooms and drinking water. Stay on the same road — do not add a town tour.',
      classification: 'recommended',
      category: 'Restroom / comfort stop',
    })
  }
  if (isTransfer && !/lunch/.test(planned) && !out.some((stop) => stop.category === 'Lunch area')) {
    push({
      name: `Lunch area toward ${day.travel?.to || day.location || 'the next stop'}`,
      note: 'Choose a clean restaurant on the same corridor. Confirm timing with guests before stopping.',
      classification: 'recommended',
      category: 'Lunch area',
    })
  }

  return out.slice(0, 6)
}

export function extractClock(text: string | null | undefined) {
  const match = String(text || '').match(/\b(\d{1,2}[:.]\d{2})\s*(am|pm)?\b/i)
  if (!match) return ''
  const time = match[1].replace('.', ':')
  return match[2] ? `${time} ${match[2].toUpperCase()}` : time
}

export function detectTrainOperation(day: ItineraryDay): TrainOperation | null {
  const planned = haystack([day.title, day.description, day.activities, day.optional_activities, day.location, day.travel?.from, day.travel?.to])
  if (!/\btrain\b|railway|nanu oya/.test(planned)) return null

  const from = day.travel?.from || day.location || TBC
  const to = day.travel?.to || day.overnight_location || day.location || TBC
  let boarding = TBC
  let destination = TBC
  if (/nanu oya/.test(planned) || /nuwara eliya|nanu/.test(from.toLowerCase())) boarding = 'Nanu Oya Railway Station'
  else if (/kandy/.test(from.toLowerCase()) && /ella|nanu/.test(planned)) boarding = 'Kandy Railway Station'
  else boarding = displayOrTbc(from)
  if (/ella/.test(planned) || /ella/.test(to.toLowerCase())) destination = 'Ella Railway Station'
  else destination = displayOrTbc(to)

  const joined = [day.title, day.description, ...(day.activities || [])].join(' ')
  const numberMatch = joined.match(/\b(?:train\s*(?:no\.?|number)?\s*)?#?\s*(\d{4,5})\b/i)
  const timeMatch =
    joined.match(/train[^.]{0,40}?\b(\d{1,2}[:.]\d{2}\s*(?:am|pm)?)\b/i) ||
    joined.match(/\b(\d{1,2}[:.]\d{2}\s*(?:am|pm)?)\b[^.]{0,20}train/i)

  const trainNumber = numberMatch?.[1] ? String(numberMatch[1]) : TBC
  const trainTime = timeMatch?.[1] ? timeMatch[1].replace('.', ':') : TBC

  return {
    kind: 'train',
    boarding,
    destination,
    trainNumber,
    trainTime,
    notes: [
      `Drop guests at ${boarding}.`,
      'Confirm they have tickets and agree luggage that travels with them versus luggage that stays in the vehicle.',
      'Driver continues separately with the main luggage. The vehicle does not travel on the train.',
      `Reposition the vehicle to ${destination.replace(/ railway station/i, '')}.`,
      `Meet guests at the agreed pickup point at ${destination}.`,
    ],
  }
}

export function detectSafariOperation(day: ItineraryDay): SafariOperation | null {
  const planned = haystack([day.title, day.description, day.activities, day.optional_activities, day.location])
  if (!/\bsafari\b|jeep/.test(planned) && !/\b(yala|minneriya|kaudulla|udawalawe|wilpattu|bundala)\b/.test(planned)) {
    return null
  }
  if (!/\bsafari\b|jeep/.test(planned) && !/national park/.test(planned)) return null

  let park = TBC
  if (/yala/.test(planned)) park = 'Yala National Park'
  else if (/minneriya/.test(planned)) park = 'Minneriya National Park'
  else if (/kaudulla/.test(planned)) park = 'Kaudulla National Park'
  else if (/udawalawe/.test(planned)) park = 'Udawalawe National Park'
  else if (/wilpattu/.test(planned)) park = 'Wilpattu National Park'
  else if (/bundala/.test(planned)) park = 'Bundala National Park'
  else if (/hurulu/.test(planned)) park = 'Hurulu Eco Park'

  const times = (day.activities || [])
    .map((line) => extractClock(line))
    .filter(Boolean)
  const start = times[0] || TBC
  const finish = times[1] || TBC

  return {
    kind: 'safari',
    park,
    start,
    finish,
    jeep: 'Hand guests to the safari jeep operator at the park gate / agreed meeting point.',
    wait: 'Wait with the LankaLux vehicle at the agreed park-gate or hotel waiting point. Stay contactable.',
    reconnect: 'Collect guests after the jeep returns. Do not follow the safari jeep into the park.',
  }
}

export function buildEnRoutePlan(day: ItineraryDay, stops: OperationalStop[], hotelName?: string | null) {
  const steps: string[] = []
  const firstActivity = (day.activities || [])[0] || ''
  const isArrival = /airport|arrival|meet and greet/i.test(`${day.title} ${day.description} ${firstActivity}`)
  steps.push(isArrival ? 'Airport meet and luggage assistance' : 'Breakfast / departure from hotel')
  const comfort = stops.find((stop) => stop.category === 'Restroom / comfort stop')
  if (comfort) steps.push(`Recommended comfort stop — ${comfort.name}`)
  const sight = (day.activities || []).filter((line) => !/check in|breakfast|depart/i.test(line)).slice(0, 2)
  for (const line of sight) steps.push(`Guests: ${line.replace(/^\d{1,2}[:.]\d{2}\s*-?\s*/i, '')}`)
  const lunch = stops.find((stop) => stop.category === 'Lunch area')
  if (lunch) steps.push(`Lunch suggestion — ${lunch.name}`)
  else if ((day.activities || []).some((line) => /lunch/i.test(line))) steps.push('Lunch as on the guest itinerary')
  if (day.travel?.from && day.travel?.to && day.travel.from !== day.travel.to) steps.push('Continue journey')
  steps.push(hotelName ? `Hotel arrival — ${hotelName}` : 'Arrive overnight location')
  return steps.slice(0, 8)
}

export function buildDriverNotes(input: {
  day: ItineraryDay
  isFirst: boolean
  isLast: boolean
  hotelName?: string | null
  special?: SpecialOperation | null
}) {
  const notes = [
    'Assist guests with luggage before departure.',
    'Keep drinking water available in the vehicle.',
    'Stay contactable while guests visit an attraction.',
    'Confirm the next pickup point with guests before they leave the vehicle.',
  ]
  if (input.isFirst) notes.unshift('Airport meet and greet. Confirm the paging board and luggage count.')
  if (input.special?.kind === 'train') {
    notes.push('Tickets and luggage split must be confirmed before the train handover.')
    notes.push('Never imply that the LankaLux vehicle travels on the train.')
  }
  if (input.special?.kind === 'safari') {
    notes.push('Confirm jeep timing with the operator before leaving the hotel.')
    notes.push('Wait at the agreed point. Do not enter the park in the LankaLux vehicle.')
  }
  if (input.hotelName) notes.push(`Reconfirm the evening plan before leaving guests at ${input.hotelName}.`)
  if (input.isLast) notes.push('Confirm departure flight timing the evening before. Allow extra time for the airport road.')
  return notes.slice(0, 7)
}

export function estimateDrivingTime(distanceKm: number | null, existing?: string | null) {
  const given = String(existing || '').trim()
  if (given) return given
  if (distanceKm == null || !Number.isFinite(distanceKm) || distanceKm <= 0) return TBC
  const minutes = Math.max(30, Math.round((distanceKm / 50) * 60 / 5) * 5)
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (!hours) return `About ${rest} minutes`
  if (!rest) return `About ${hours} hour${hours === 1 ? '' : 's'}`
  return `About ${hours} hour${hours === 1 ? '' : 's'} ${rest} minutes`
}

export function suggestedDeparture(day: ItineraryDay, opts: { isFirst: boolean; arrivalTime?: string | null; special?: SpecialOperation | null }) {
  if (opts.special?.kind === 'safari') {
    return opts.special.start !== TBC ? `Leave hotel in time for a ${opts.special.start} safari start` : 'Leave hotel in time for the safari briefing — time TO BE CONFIRMED'
  }
  if (opts.special?.kind === 'train') {
    return opts.special.trainTime !== TBC
      ? `Arrive at the station at least 45 minutes before ${opts.special.trainTime}`
      : 'Arrive at the station early — train time TO BE CONFIRMED'
  }
  if (opts.isFirst && opts.arrivalTime) return `Meet guests after arrival (${opts.arrivalTime})`
  const first = extractClock(day.activities?.[0] || day.title)
  if (first) return first
  const isTransfer = Boolean(day.travel?.from && day.travel?.to && day.travel.from !== day.travel.to)
  return isTransfer ? '08:00' : '08:30'
}

export function parseKm(distance: string | null | undefined) {
  const match = String(distance || '').replace(/,/g, '').match(/(\d+(?:\.\d+)?)/)
  if (!match) return null
  const n = Number(match[1])
  return Number.isFinite(n) ? n : null
}
