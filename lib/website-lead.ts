/** Map lankalux.com form/chat payloads onto Client Request columns. */

const MONTH_INDEX: Record<string, number> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
}

const MONTH_TOKEN = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const BLANK_DATE = /^(not specified|n\/a|na|none|tbd|-)?$/i

const META_LINE =
  /^(travel dates|passengers|kids ages(?:\s*\(as selected\))?|need airline tickets|flying from|flight dates|source)\s*:/i

export function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && ISO_DATE.test(value)
}

function pad(n: number) {
  return String(n).padStart(2, '0')
}

function utcIso(year: number, monthIndex: number, day: number): string | null {
  if (!Number.isFinite(year) || !Number.isFinite(monthIndex) || !Number.isFinite(day)) return null
  if (year < 1900 || year > 2100 || monthIndex < 0 || monthIndex > 11 || day < 1 || day > 31) return null
  const dt = new Date(Date.UTC(year, monthIndex, day))
  if (dt.getUTCFullYear() !== year || dt.getUTCMonth() !== monthIndex || dt.getUTCDate() !== day) return null
  return `${year}-${pad(monthIndex + 1)}-${pad(day)}`
}

function monthIndex(token: string): number | null {
  const key = token.replace(/\./g, '').toLowerCase()
  return key in MONTH_INDEX ? MONTH_INDEX[key] : null
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim()
}

function blankToNull(value: string | null | undefined): string | null {
  const s = (value || '').trim()
  if (!s || BLANK_DATE.test(s) || /^not provided$/i.test(s)) return null
  return s
}

export function inclusiveDurationDays(start: string | null | undefined, end: string | null | undefined): number | null {
  if (!start || !end || !isIsoDate(start) || !isIsoDate(end)) return null
  const a = new Date(`${start}T00:00:00Z`)
  const b = new Date(`${end}T00:00:00Z`)
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null
  return Math.floor(Math.abs(b.getTime() - a.getTime()) / 86400000) + 1
}

export function toIsoDate(value: unknown): string | null {
  if (value == null) return null
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null
    return utcIso(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate())
  }
  const raw = text(value)
  if (!raw || BLANK_DATE.test(raw)) return null

  const isoPrefix = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (isoPrefix) return utcIso(Number(isoPrefix[1]), Number(isoPrefix[2]) - 1, Number(isoPrefix[3]))

  const dMonthY = raw.match(new RegExp(`^(\\d{1,2})[./\\s-]+(${MONTH_TOKEN})\\.?[./\\s-]+(\\d{4})$`, 'i'))
  if (dMonthY) {
    const mon = monthIndex(dMonthY[2])
    if (mon != null) return utcIso(Number(dMonthY[3]), mon, Number(dMonthY[1]))
  }

  const monthDY = raw.match(new RegExp(`^(${MONTH_TOKEN})\\.?[\\s-]+(\\d{1,2}),?[\\s-]+(\\d{4})$`, 'i'))
  if (monthDY) {
    const mon = monthIndex(monthDY[1])
    if (mon != null) return utcIso(Number(monthDY[3]), mon, Number(monthDY[2]))
  }

  const numeric = raw.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/)
  if (numeric) {
    const a = Number(numeric[1])
    const b = Number(numeric[2])
    const year = Number(numeric[3])
    if (a > 12) return utcIso(year, b - 1, a)
    if (b > 12) return utcIso(year, a - 1, b)
    return utcIso(year, b - 1, a)
  }

  return null
}

export function parseDateRange(value: unknown): { start: string | null; end: string | null } {
  const raw = text(value)
  if (!raw || BLANK_DATE.test(raw)) return { start: null, end: null }

  const asSingle = toIsoDate(raw)
  if (asSingle) return { start: asSingle, end: null }

  const found: string[] = []
  const push = (iso: string | null) => {
    if (iso && found[found.length - 1] !== iso) found.push(iso)
  }

  const rangeSameYear = new RegExp(
    `\\b(\\d{1,2})[./\\s-]+(${MONTH_TOKEN})\\.?\\s*(?:(\\d{4}))?\\s*(?:[–—−-]|to)\\s*(\\d{1,2})[./\\s-]+(${MONTH_TOKEN})\\.?\\s*(\\d{4})\\b`,
    'ig'
  )
  let m: RegExpExecArray | null
  while ((m = rangeSameYear.exec(raw))) {
    const year1 = m[3] ? Number(m[3]) : Number(m[6])
    const mon1 = monthIndex(m[2])
    const mon2 = monthIndex(m[5])
    if (mon1 != null) push(utcIso(year1, mon1, Number(m[1])))
    if (mon2 != null) push(utcIso(Number(m[6]), mon2, Number(m[4])))
  }

  const monthRange = new RegExp(
    `\\b(${MONTH_TOKEN})\\.?\\s+(\\d{1,2}),?\\s*(?:(\\d{4}))?\\s*(?:[–—−-]|to)\\s*(${MONTH_TOKEN})\\.?\\s+(\\d{1,2}),?\\s*(\\d{4})\\b`,
    'ig'
  )
  while ((m = monthRange.exec(raw))) {
    const year1 = m[3] ? Number(m[3]) : Number(m[6])
    const mon1 = monthIndex(m[1])
    const mon2 = monthIndex(m[4])
    if (mon1 != null) push(utcIso(year1, mon1, Number(m[2])))
    if (mon2 != null) push(utcIso(Number(m[6]), mon2, Number(m[5])))
  }

  if (found.length >= 2) return { start: found[0], end: found[1] }

  const isoDates = Array.from(raw.matchAll(/\b(\d{4}-\d{2}-\d{2})\b/g)).map((x) => x[1])
  if (isoDates.length >= 2) return { start: isoDates[0], end: isoDates[1] }
  if (isoDates.length === 1) return { start: isoDates[0], end: found[0] && found[0] !== isoDates[0] ? found[0] : null }

  const dMonthY = new RegExp(`\\b(\\d{1,2})[./\\s-]+(${MONTH_TOKEN})\\.?[./\\s-]+(\\d{4})\\b`, 'ig')
  while ((m = dMonthY.exec(raw))) {
    const mon = monthIndex(m[2])
    if (mon != null) push(utcIso(Number(m[3]), mon, Number(m[1])))
  }
  const monthDY = new RegExp(`\\b(${MONTH_TOKEN})\\.?\\s+(\\d{1,2}),?\\s+(\\d{4})\\b`, 'ig')
  while ((m = monthDY.exec(raw))) {
    const mon = monthIndex(m[1])
    if (mon != null) push(utcIso(Number(m[3]), mon, Number(m[2])))
  }

  if (found.length >= 2) return { start: found[0], end: found[1] }
  if (found.length === 1) return { start: found[0], end: null }
  return { start: null, end: null }
}

export function parsePassengers(display: unknown): { adults: number | null; children: number | null } {
  const raw = text(display)
  if (!raw) return { adults: null, children: null }
  const adultsMatch = raw.match(/(\d+)\s*adult/i)
  const childrenMatch = raw.match(/(\d+)\s*child/i)
  const travellersMatch = raw.match(/(\d+)\s*travell?ers?/i)
  const adults = adultsMatch ? parseInt(adultsMatch[1], 10) : travellersMatch ? parseInt(travellersMatch[1], 10) : null
  const children = childrenMatch ? parseInt(childrenMatch[1], 10) : adultsMatch ? 0 : null
  return {
    adults: Number.isFinite(adults as number) ? adults : null,
    children: Number.isFinite(children as number) ? children : null,
  }
}

export function parseKidsAges(value: unknown): number[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => parseOneAge(item))
      .filter((n): n is number => n != null)
  }
  const raw = text(value)
  if (!raw || /^none$/i.test(raw)) return []
  if (raw.startsWith('[')) {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parseKidsAges(parsed)
    } catch {
      // fall through to comma-separated labels
    }
  }
  return raw
    .split(',')
    .map((part) => parseOneAge(part.trim()))
    .filter((n): n is number => n != null)
}

function parseOneAge(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return Math.round(value)
  const raw = text(value)
  if (!raw) return null
  if (/under\s*2|^under2$/i.test(raw)) return 1
  if (/2\s*[–-]\s*5/.test(raw) || raw === '2-5') return 3
  if (/6\s*[–-]\s*11/.test(raw) || raw === '6-11') return 8
  const n = parseInt(raw, 10)
  return Number.isFinite(n) && n >= 0 && n <= 18 ? n : null
}

function parseMaybeInt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value)
  if (value == null || value === '') return null
  const n = parseInt(String(value), 10)
  return Number.isFinite(n) ? n : null
}

function truthyFlag(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  const s = text(value).toLowerCase()
  return s === 'yes' || s === 'true' || s === '1' || s === 'y'
}

export function splitDumpedLeadText(raw: string | null | undefined): {
  message: string
  travelDates: string | null
  passengers: string | null
  kidsAges: string | null
  airlineFrom: string | null
  airlineDates: string | null
  needAirlineTickets: boolean | null
} {
  const textValue = (raw || '').replace(/\r\n/g, '\n').trim()
  if (!textValue) {
    return {
      message: '',
      travelDates: null,
      passengers: null,
      kidsAges: null,
      airlineFrom: null,
      airlineDates: null,
      needAirlineTickets: null,
    }
  }

  const lines = textValue.split('\n')
  const messageLines: string[] = []
  let travelDates: string | null = null
  let passengers: string | null = null
  let kidsAges: string | null = null
  let airlineFrom: string | null = null
  let airlineDates: string | null = null
  let needAirlineTickets: boolean | null = null
  let inMeta = false

  for (const line of lines) {
    const trimmed = line.trim()
    const labeled = trimmed.match(/^([^:]+):\s*(.*)$/)
    const label = labeled ? labeled[1].trim().toLowerCase() : ''
    const value = labeled ? labeled[2].trim() : ''

    if (/^travel dates$/i.test(label)) {
      inMeta = true
      travelDates = blankToNull(value)
      continue
    }
    if (/^passengers$/i.test(label)) {
      inMeta = true
      passengers = blankToNull(value)
      continue
    }
    if (/^kids ages/i.test(label)) {
      inMeta = true
      kidsAges = blankToNull(value)
      continue
    }
    if (/^need airline tickets$/i.test(label)) {
      inMeta = true
      needAirlineTickets = truthyFlag(value)
      continue
    }
    if (/^flying from$/i.test(label)) {
      inMeta = true
      airlineFrom = blankToNull(value)
      continue
    }
    if (/^flight dates$/i.test(label)) {
      inMeta = true
      airlineDates = blankToNull(value)
      continue
    }
    if (inMeta && META_LINE.test(trimmed)) continue
    if (!inMeta) messageLines.push(line)
  }

  return {
    message: messageLines.join('\n').trim(),
    travelDates,
    passengers,
    kidsAges,
    airlineFrom,
    airlineDates,
    needAirlineTickets,
  }
}

function leadSource(source: unknown): string | null {
  const s = text(source)
  if (!s) return null
  const key = s.toLowerCase()
  if (key === 'hero-form' || key === 'website' || key === 'lankalux.com') return 'Website'
  if (key === 'vehicle-reservation') return 'Vehicle reservation'
  if (key === 'itinerary-review') return 'Itinerary review'
  if (key === 'chat' || key === 'website-chat') return 'Website chat'
  if (key.includes('journey')) return 'Journey page'
  return s
}

function vehicleFromMessage(message: string): { vehicle: string | null; rest: string } {
  const match = message.match(/^vehicle:\s*(.+)$/im)
  if (!match) return { vehicle: null, rest: message }
  const vehicle = match[1].trim() || null
  const rest = message.replace(/^vehicle:\s*.+$/im, '').trim()
  return { vehicle, rest }
}

function itineraryRouteFromMessage(message: string): { destinations: string | null; rest: string } {
  const match = message.match(/current itinerary or route:\s*\n+([\s\S]+?)(?:\n\n|$)/i)
  if (!match) return { destinations: null, rest: message }
  const destinations = match[1].trim() || null
  return { destinations, rest: message }
}

export type MappedWebsiteLead = {
  client_name: string
  email: string
  whatsapp: string | null
  origin_country: string | null
  start_date: string | null
  end_date: string | null
  duration: number | null
  number_of_adults: number | null
  number_of_children: number | null
  children_ages: number[]
  interests: string | null
  additional_preferences: string | null
  special_requirements: string | null
  arrival_flight: string | null
  departure_flight: string | null
  requested_destinations: string | null
  vehicle_preference: string | null
  lead_source: string | null
}

function mergeDump(
  a: ReturnType<typeof splitDumpedLeadText>,
  b: ReturnType<typeof splitDumpedLeadText>
): ReturnType<typeof splitDumpedLeadText> {
  return {
    message: a.message || b.message,
    travelDates: a.travelDates || b.travelDates,
    passengers: a.passengers || b.passengers,
    kidsAges: a.kidsAges || b.kidsAges,
    airlineFrom: a.airlineFrom || b.airlineFrom,
    airlineDates: a.airlineDates || b.airlineDates,
    needAirlineTickets: a.needAirlineTickets ?? b.needAirlineTickets,
  }
}

export function mapWebsiteLead(body: Record<string, unknown>): MappedWebsiteLead {
  const dumped = mergeDump(
    splitDumpedLeadText(text(body.message)),
    mergeDump(splitDumpedLeadText(text(body.additional_preferences)), splitDumpedLeadText(text(body.interests)))
  )

  let start = toIsoDate(body.startDate ?? body.start_date)
  let end = toIsoDate(body.endDate ?? body.end_date)
  if (!start || !end) {
    const range = parseDateRange(body.travelDates ?? body.travel_dates ?? dumped.travelDates)
    start = start || range.start
    end = end || range.end
  }
  if (!start || !end) {
    const fromNotes = parseDateRange(dumped.message || text(body.message))
    start = start || fromNotes.start
    end = end || fromNotes.end
  }

  let adults = parseMaybeInt(body.numberOfAdults ?? body.number_of_adults)
  let children = parseMaybeInt(body.numberOfChildren ?? body.number_of_children)
  if (adults == null || children == null) {
    const parsed = parsePassengers(body.passengers ?? dumped.passengers)
    if (adults == null) adults = parsed.adults
    if (children == null) children = parsed.children
  }

  let ages = parseKidsAges(body.childrenAgesValues ?? body.children_ages ?? body.kidsAges ?? dumped.kidsAges)
  if (children == null && ages.length) children = ages.length
  if (children === 0) ages = []

  const needAirline = truthyFlag(body.needAirlineTickets) || dumped.needAirlineTickets === true
  const airlineFrom = blankToNull(text(body.airlineFrom) || dumped.airlineFrom || '')
  const airlineDates = blankToNull(text(body.airlineDates) || dumped.airlineDates || '')
  const airlineRange = parseDateRange(airlineDates)

  let message = dumped.message || text(body.message)
  const vehicleFromBody = blankToNull(text(body.vehiclePreference ?? body.vehicle_preference))
  const extractedVehicle = vehicleFromMessage(message)
  if (extractedVehicle.vehicle) message = extractedVehicle.rest

  const extractedRoute = itineraryRouteFromMessage(message)
  const destinations =
    blankToNull(text(body.requestedDestinations ?? body.requested_destinations ?? body.journeyName ?? body.route)) ||
    extractedRoute.destinations

  const specialParts: string[] = []
  if (needAirline) {
    specialParts.push('Needs airline tickets')
    if (airlineFrom) specialParts.push(`Flying from ${airlineFrom}`)
    if (airlineDates) specialParts.push(`Flight dates ${airlineDates}`)
  }
  const special = specialParts.length ? specialParts.join('. ') + '.' : null

  const interests = blankToNull(message)
  const whatsapp = blankToNull(text(body.whatsapp ?? body.phone))

  return {
    client_name: text(body.name ?? body.client_name),
    email: text(body.email),
    whatsapp,
    origin_country: blankToNull(text(body.origin_country ?? body.originCountry ?? body.country)),
    start_date: start,
    end_date: end,
    duration: inclusiveDurationDays(start, end),
    number_of_adults: adults,
    number_of_children: children,
    children_ages: ages,
    interests,
    additional_preferences: interests,
    special_requirements: special,
    arrival_flight: needAirline ? [airlineFrom, airlineRange.start].filter(Boolean).join(' · ') || null : null,
    departure_flight: needAirline ? airlineRange.end : null,
    requested_destinations: destinations,
    vehicle_preference: vehicleFromBody || extractedVehicle.vehicle,
    lead_source: leadSource(body.source ?? body.lead_source),
  }
}

export type HydrateLeadRow = {
  start_date?: string | null
  end_date?: string | null
  duration?: number | null
  number_of_adults?: number | null
  number_of_children?: number | null
  children_ages?: string | number[] | null
  additional_preferences?: string | null
  interests?: string | null
  special_requirements?: string | null
  arrival_flight?: string | null
  departure_flight?: string | null
  requested_destinations?: string | null
  vehicle_preference?: string | null
  lead_source?: string | null
}

export function hydrateStoredLead<T extends HydrateLeadRow>(row: T): T & { _leadHydrated?: boolean } {
  const dumpedFrom = row.additional_preferences || row.interests || ''
  const dumped = splitDumpedLeadText(dumpedFrom)
  const looksDumped = Boolean(dumped.travelDates || dumped.passengers || dumped.needAirlineTickets != null)

  const mapped = mapWebsiteLead({
    startDate: row.start_date,
    endDate: row.end_date,
    numberOfAdults: row.number_of_adults,
    numberOfChildren: row.number_of_children,
    children_ages: row.children_ages,
    kidsAges: dumped.kidsAges,
    passengers: dumped.passengers,
    travelDates: dumped.travelDates,
    message: looksDumped ? dumped.message : row.interests || row.additional_preferences,
    needAirlineTickets: dumped.needAirlineTickets,
    airlineFrom: dumped.airlineFrom,
    airlineDates: dumped.airlineDates,
    requested_destinations: row.requested_destinations,
    vehicle_preference: row.vehicle_preference,
    lead_source: row.lead_source,
    additional_preferences: dumpedFrom,
  })

  const start = toIsoDate(row.start_date) || mapped.start_date
  const end = toIsoDate(row.end_date) || mapped.end_date
  const interests = looksDumped ? mapped.interests : blankToNull(row.interests || '') || mapped.interests
  const additional = looksDumped ? mapped.additional_preferences : blankToNull(row.additional_preferences || '') || interests

  const existingAges = parseKidsAges(row.children_ages)
  const ages = existingAges.length ? existingAges : mapped.children_ages
  const childrenAgesValue = Array.isArray(row.children_ages)
    ? ages
    : ages.length
      ? JSON.stringify(ages)
      : row.children_ages ?? null

  const next = {
    ...row,
    start_date: start,
    end_date: end,
    duration: inclusiveDurationDays(start, end) ?? row.duration ?? null,
    number_of_adults: row.number_of_adults ?? mapped.number_of_adults,
    number_of_children: row.number_of_children ?? mapped.number_of_children,
    children_ages: childrenAgesValue,
    interests: interests,
    additional_preferences: additional,
    special_requirements: row.special_requirements || mapped.special_requirements,
    arrival_flight: row.arrival_flight || mapped.arrival_flight,
    departure_flight: row.departure_flight || mapped.departure_flight,
    requested_destinations: row.requested_destinations || mapped.requested_destinations,
    vehicle_preference: row.vehicle_preference || mapped.vehicle_preference,
    lead_source: row.lead_source || (looksDumped ? mapped.lead_source || 'Website' : mapped.lead_source),
  }

  const changed =
    next.start_date !== (row.start_date || null) ||
    next.end_date !== (row.end_date || null) ||
    next.interests !== (row.interests || null) ||
    next.additional_preferences !== (row.additional_preferences || null) ||
    (next.number_of_adults ?? null) !== (row.number_of_adults ?? null) ||
    (next.number_of_children ?? null) !== (row.number_of_children ?? null) ||
    Boolean(!row.special_requirements && next.special_requirements)

  return changed ? { ...next, _leadHydrated: true } : next
}
