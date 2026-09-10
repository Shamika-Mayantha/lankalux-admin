import { parseDriverPack } from '@/lib/driver-pack/fields'
import { roadKm } from '@/services/kilometers.service'
import { googleMapsSearchUrl, looksLikeMapsUrl } from '@/lib/driver-pack/mapLinkHelpers'
import { formatDateLabel, formatLongDate, formatShortDate, splitGuestNames } from '@/lib/driver-pack/filenameHelpers'
import {
  TBC,
  buildDriverNotes,
  buildEnRoutePlan,
  detectSafariOperation,
  detectTrainOperation,
  displayOrTbc,
  estimateDrivingTime,
  operationalStopsForDay,
  parseKm,
  suggestedDeparture,
  type OperationalStop,
  type SpecialOperation,
} from '@/lib/driver-pack/routeHelpers'
import type { ClientRequestRow, DriverPackFields, DriverRecord, HotelRecord, ItineraryDay, ItineraryRecord, VehicleRecord } from '@/types/domain'

export type DriverPackForm = {
  guestNames: string
  startDate: string
  endDate: string
  chauffeurName: string
  chauffeurPhone: string
  vehicleName: string
  vehicleRegistration: string
  arrivalFlight: string
  arrivalDate: string
  arrivalTime: string
  departureFlight: string
  departureDate: string
  departureTime: string
  notes: string
}

export type DriverHotel = {
  name: string
  address: string
  mapsUrl: string
  qrDataUrl?: string
}

export type DriverPlace = {
  name: string
  address: string
}

export type DriverDay = {
  dayNumber: number
  date: string
  dateLabel: string
  longDate: string
  routeLabel: string
  from: string
  to: string
  start: DriverPlace
  destination: DriverPlace
  suggestedDeparture: string
  drivingTime: string
  distance: string
  isTransfer: boolean
  guestActivities: string[]
  enRoutePlan: string[]
  stops: OperationalStop[]
  driverNotes: string[]
  hotel: DriverHotel | null
  special: SpecialOperation | null
}

export type DriverLogRow = {
  dateLabel: string
  routeDuty: string
}

export type DriverPackData = {
  guestName: string
  guestNames: string[]
  startDate: string
  endDate: string
  travelDatesLabel: string
  chauffeurName: string
  chauffeurPhone: string
  vehicleName: string
  vehicleRegistration: string
  arrivalFlight: string
  arrivalDate: string
  arrivalTime: string
  departureFlight: string
  departureDate: string
  departureTime: string
  notes: string
  days: DriverDay[]
  logRows: DriverLogRow[]
  missing: string[]
  status: 'ready' | 'information_required'
  pagingReady: boolean
  logReady: boolean
  journeyReady: boolean
}

type StayHotel = Pick<HotelRecord, 'id' | 'name' | 'destination' | 'description' | 'contact' | 'website'> & {
  location?: string | null
  mapsUrl?: string | null
}

function text(value: string | null | undefined) {
  return String(value || '').trim()
}

export function formFromSources(input: {
  request: ClientRequestRow
  itinerary?: ItineraryRecord | null
  vehicle?: VehicleRecord | null
  driver?: DriverRecord | null
}): DriverPackForm {
  const overlay = parseDriverPack(input.request.driver_pack)
  const chauffeurName =
    overlay.chauffeur_guide_name ||
    input.driver?.full_name ||
    input.request.assigned_employee ||
    ''
  return {
    guestNames: overlay.guest_names || input.request.client_name || '',
    startDate: overlay.travel_start || input.request.start_date || '',
    endDate: overlay.travel_end || input.request.end_date || '',
    chauffeurName,
    chauffeurPhone: overlay.chauffeur_guide_phone || input.driver?.phone || '',
    vehicleName: input.vehicle?.name || '',
    vehicleRegistration: overlay.vehicle_registration || '',
    arrivalFlight: overlay.arrival_flight || input.request.arrival_flight || '',
    arrivalDate: overlay.arrival_date || input.request.start_date || '',
    arrivalTime: overlay.arrival_time || '',
    departureFlight: overlay.departure_flight || input.request.departure_flight || '',
    departureDate: overlay.departure_date || input.request.end_date || '',
    departureTime: overlay.departure_time || '',
    notes: overlay.notes || '',
  }
}

export function formToFields(form: DriverPackForm): DriverPackFields {
  return parseDriverPack({
    guest_names: form.guestNames,
    travel_start: form.startDate,
    travel_end: form.endDate,
    chauffeur_guide_name: form.chauffeurName,
    chauffeur_guide_phone: form.chauffeurPhone,
    vehicle_registration: form.vehicleRegistration,
    arrival_flight: form.arrivalFlight,
    arrival_date: form.arrivalDate,
    arrival_time: form.arrivalTime,
    departure_flight: form.departureFlight,
    departure_date: form.departureDate,
    departure_time: form.departureTime,
    notes: form.notes,
  })
}

function hotelAddress(hotel: StayHotel | null | undefined) {
  if (!hotel) return TBC
  const fromContact = text(hotel.contact)
  if (fromContact && /[0-9]|road|rd|street|lane|watta|negombo|habarana|kandy/i.test(fromContact) && !/^[\d+\s()-]+$/.test(fromContact)) {
    return fromContact
  }
  const destination = text(hotel.destination) || text(hotel.location)
  const firstLine = text(hotel.description).split('\n')[0]
  if (firstLine && firstLine.length < 90 && /[0-9]|road|rd|street|lane/i.test(firstLine)) return firstLine
  return destination || TBC
}

function resolveHotel(day: ItineraryDay, hotels: StayHotel[]): StayHotel | null {
  if (day.hotel_id) {
    const byId = hotels.find((hotel) => hotel.id === day.hotel_id)
    if (byId) return byId
  }
  if (day.hotel_name) {
    const byName = hotels.find((hotel) => hotel.name.toLowerCase() === day.hotel_name!.toLowerCase())
    if (byName) return byName
  }
  const place = `${day.overnight_location || ''} ${day.location || ''}`.toLowerCase()
  return hotels.find((hotel) => {
    const dest = `${hotel.destination || ''} ${hotel.location || ''}`.toLowerCase()
    return dest && place && (place.includes(dest) || dest.includes(place.split(' ')[0] || '___'))
  }) || null
}

function mapsLink(hotel: StayHotel | null | undefined, name: string, address: string) {
  if (looksLikeMapsUrl(hotel?.mapsUrl)) return text(hotel?.mapsUrl)
  if (looksLikeMapsUrl(hotel?.website)) return text(hotel?.website)
  return googleMapsSearchUrl(name, address !== TBC ? address : '')
}

function toDriverHotel(hotel: StayHotel | null, fallbackName?: string | null): DriverHotel | null {
  const name = text(hotel?.name) || text(fallbackName)
  if (!name) return null
  const address = hotelAddress(hotel)
  return { name, address, mapsUrl: mapsLink(hotel, name, address) }
}

function padDay(n: number) {
  return String(n).padStart(2, '0')
}

function addDays(iso: string, days: number) {
  const match = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!match) return ''
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days))
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function airportStart(form: DriverPackForm): DriverPlace {
  return {
    name: 'Bandaranaike International Airport',
    address: form.arrivalFlight ? `Arrival ${form.arrivalFlight}${form.arrivalTime ? ` · ${form.arrivalTime}` : ''}` : 'Katunayake',
  }
}

function placeFromHotel(hotel: DriverHotel | null, fallbackName: string, fallbackAddress?: string): DriverPlace {
  if (hotel) return { name: hotel.name, address: hotel.address }
  return { name: fallbackName || TBC, address: fallbackAddress || TBC }
}

export function missingDriverPackFields(form: DriverPackForm, dayCount: number) {
  const missing: string[] = []
  if (!text(form.chauffeurName)) missing.push('Chauffeur-guide')
  if (!text(form.vehicleName)) missing.push('Vehicle')
  if (!text(form.vehicleRegistration)) missing.push('Vehicle registration')
  if (!text(form.arrivalFlight)) missing.push('Arrival flight')
  if (!text(form.startDate) || !text(form.endDate)) missing.push('Travel dates')
  if (!text(form.guestNames)) missing.push('Guest names')
  if (!dayCount) missing.push('Sold itinerary route')
  return missing
}

export function buildDriverPackData(input: {
  form: DriverPackForm
  itinerary?: ItineraryRecord | null
  hotels?: StayHotel[]
}): DriverPackData {
  const form = input.form
  const days = (input.itinerary?.payload?.days || []) as ItineraryDay[]
  const hotels = input.hotels || []
  const guestNames = splitGuestNames(form.guestNames)
  const guestName = guestNames.join(' & ') || text(form.guestNames) || TBC
  const startDate = form.startDate
  const endDate = form.endDate
  const travelDatesLabel =
    startDate || endDate ? `${formatDateLabel(startDate) || TBC} – ${formatDateLabel(endDate) || TBC}` : TBC

  const builtDays: DriverDay[] = days.map((day, index) => {
    const prev = days[index - 1]
    const hotel = toDriverHotel(resolveHotel(day, hotels), day.hotel_name)
    const prevHotel = prev ? toDriverHotel(resolveHotel(prev, hotels), prev.hotel_name) : null
    const from = text(day.travel?.from) || text(prev?.overnight_location) || text(prev?.location) || (index === 0 ? 'Airport' : text(day.location))
    const to = text(day.travel?.to) || text(day.overnight_location) || text(day.location)
    const isTransfer = Boolean(from && to && from.toLowerCase() !== to.toLowerCase())
    const km = parseKm(day.travel?.estimated_distance) ?? (isTransfer ? roadKm(from, to) : null)
    const special = detectTrainOperation(day) || detectSafariOperation(day)
    const stops = operationalStopsForDay(day)
    const start =
      index === 0
        ? airportStart(form)
        : placeFromHotel(prevHotel, from, prev?.overnight_location || prev?.location)
    const destination = placeFromHotel(hotel, to, day.overnight_location || day.location)
    const date = day.date || addDays(form.startDate, index)
    const localDuty = !isTransfer
    const routeLabel = localDuty
      ? `${to || day.location || 'Local'} local sightseeing`
      : `${from} → ${to}`

    return {
      dayNumber: day.day || index + 1,
      date,
      dateLabel: formatShortDate(date),
      longDate: formatLongDate(date),
      routeLabel,
      from,
      to,
      start,
      destination,
      suggestedDeparture: suggestedDeparture(day, {
        isFirst: index === 0,
        arrivalTime: form.arrivalTime,
        special,
      }),
      drivingTime: estimateDrivingTime(km, day.travel?.estimated_duration),
      distance: km ? `${Math.round(km)} km` : displayOrTbc(day.travel?.estimated_distance),
      isTransfer,
      guestActivities: (day.activities || []).filter(Boolean),
      enRoutePlan: buildEnRoutePlan(day, stops, hotel?.name),
      stops,
      driverNotes: buildDriverNotes({
        day,
        isFirst: index === 0,
        isLast: index === days.length - 1,
        hotelName: hotel?.name,
        special,
      }),
      hotel,
      special,
    }
  })

  const logRows: DriverLogRow[] = builtDays.map((day, index) => {
    let routeDuty = day.routeLabel
    if (index === 0) routeDuty = `Airport → ${day.hotel?.name || day.to || day.start.name}`
    if (index === builtDays.length - 1 && form.departureFlight) {
      routeDuty = `${day.hotel?.name || day.from || day.to} → Airport`
    }
    return {
      dateLabel: day.dateLabel || `Day ${padDay(day.dayNumber)}`,
      routeDuty,
    }
  })

  const missing = missingDriverPackFields(form, builtDays.length)
  const pagingReady = guestNames.length > 0
  const logReady = Boolean(text(form.guestNames) && startDate && endDate && text(form.chauffeurName) && builtDays.length)
  const journeyReady = builtDays.length > 0

  return {
    guestName,
    guestNames,
    startDate,
    endDate,
    travelDatesLabel,
    chauffeurName: displayOrTbc(form.chauffeurName),
    chauffeurPhone: displayOrTbc(form.chauffeurPhone),
    vehicleName: displayOrTbc(form.vehicleName),
    vehicleRegistration: displayOrTbc(form.vehicleRegistration),
    arrivalFlight: displayOrTbc(form.arrivalFlight),
    arrivalDate: form.arrivalDate,
    arrivalTime: displayOrTbc(form.arrivalTime),
    departureFlight: displayOrTbc(form.departureFlight),
    departureDate: form.departureDate,
    departureTime: displayOrTbc(form.departureTime),
    notes: form.notes,
    days: builtDays,
    logRows,
    missing,
    status: missing.length ? 'information_required' : 'ready',
    pagingReady,
    logReady,
    journeyReady,
  }
}

export { padDay }
