import { parseItineraryJson } from '../validation/itinerary.schema'
import { assignDayImages, matchDestination } from '../services/image-map.service'
import { calculateTotalKilometers, LOCAL_DAY_KM } from '../services/kilometers.service'
import { shouldExpireRequest } from '../config/status'
import {
  calculateTotals,
  invoiceStatus,
  parseClientFacingPrice,
  paymentStatus,
  uniqueInOrder,
} from '../services/invoice-math'
import { renderFollowUpEmail, renderInvoiceEmail } from '../services/journey-copy'
import {
  followUpBcc,
  followUpCta,
  followUpCtas,
  getTemplate,
  GOOGLE_REVIEW_URL,
  TRUSTPILOT_AFS_BCC,
  TRUSTPILOT_REVIEW_URL,
  normalizeEditableBody,
  trustpilotAfsSnippet,
} from '../lib/email-templates'
import { placesForJourney, ensureMinimumDayActivities } from '../config/sri-lanka-places'
import { buildItineraryPrompt, enRouteDesignRules } from '../services/itinerary-prompt'
import { applyHotelsToDays, hotelsPromptSection } from '../services/hotel-match.service'
import { driverPackFilenames, sanitizeFilename, splitGuestNames } from '../lib/driver-pack/filenameHelpers'
import { googleMapsSearchUrl } from '../lib/driver-pack/mapLinkHelpers'
import { detectTrainOperation, operationalStopsForDay, TBC } from '../lib/driver-pack/routeHelpers'
import { buildDriverPackData } from '../lib/driver-pack/buildDriverPackData'

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg)
}

const parsed = parseItineraryJson({
  title: 'Hill & Coast',
  summary: 'A paced journey.',
  days: [
    { day: 1, location: 'Sigiriya', title: 'Rock fortress', activities: ['09:00 - Climb'] },
    { day: 2, location: 'Kandy', title: 'Temple', activities: ['10:00 - Tooth relic'] },
    { day: 3, location: 'Ella', title: 'Nine arches', activities: ['11:00 - Train'] },
    { day: 4, location: 'Yala', title: 'Safari', activities: ['06:00 - Jeep'] },
    { day: 5, location: 'Mirissa', title: 'Coast', activities: ['07:00 - Whale watch'] },
  ],
})
assert(parsed.ok, 'schema should accept a valid itinerary')
if (parsed.ok) {
  assert(parsed.data.days.length === 5, 'five days')
}

const withVehicle = parseItineraryJson({
  title: 'Hill & Coast',
  summary: 'A paced journey.',
  vehicle_id: 'voxy',
  days: [{ day: 1, location: 'Sigiriya', title: 'Rock fortress', activities: ['09:00 - Climb'] }],
})
assert(withVehicle.ok, 'schema should accept vehicle_id')
if (withVehicle.ok) {
  assert(withVehicle.data.vehicle_id === 'voxy', 'vehicle_id should be kept on the itinerary')
}

const bad = parseItineraryJson({ title: '', summary: '', days: [] })
assert(!bad.ok, 'empty itinerary must fail validation')

assert(matchDestination('Sigiriya')?.key === 'Sigiriya', 'sigiriya map')
assert(matchDestination('Ella Rock')?.key === 'Ella', 'ella map')
assert(matchDestination('Yala safari')?.key === 'Yala', 'yala map')
assert(matchDestination('Mirissa beach')?.key === 'Mirissa', 'mirissa map')

const images = assignDayImages([
  { location: 'Sigiriya' },
  { location: 'Kandy' },
  { location: 'Ella' },
  { location: 'Yala' },
  { location: 'Mirissa' },
])
assert(images.every((arr) => arr[0]?.startsWith('/images/')), 'images assigned from library')
assert(new Set(images.map((a) => a[0])).size === 5, 'unique images per day where possible')

assert(shouldExpireRequest({ start_date: '2026-08-10', status: 'new' }, '2026-08-14') === true, 'expire 4 days after start')
assert(shouldExpireRequest({ start_date: '2026-08-11', status: 'new' }, '2026-08-14') === true, 'expire on day 3')
assert(shouldExpireRequest({ start_date: '2026-08-12', status: 'new' }, '2026-08-14') === false, 'do not expire at 2 days')
assert(shouldExpireRequest({ start_date: '2026-08-10', status: 'sold' }, '2026-08-14') === false, 'sold trips do not expire')
assert(shouldExpireRequest({ start_date: '2026-08-20', status: 'follow_up' }, '2026-08-14') === false, 'future dates stay open')

const classic = calculateTotalKilometers([
  { location: 'Sigiriya' },
  { location: 'Kandy' },
  { location: 'Nuwara Eliya' },
  { location: 'Ella' },
  { location: 'Yala' },
  { location: 'Galle' },
])
assert(classic.total === 170 + 100 + 80 + 50 + 120 + 200 + 120, `classic route should be 840km, got ${classic.total}`)

const withLocalDay = calculateTotalKilometers([
  { location: 'Sigiriya' },
  { location: 'Sigiriya' },
  { location: 'Kandy' },
])
assert(
  withLocalDay.total === 170 + LOCAL_DAY_KM + 100 + 115,
  `local day should add 90km, got ${withLocalDay.total}`
)

const endsInColombo = calculateTotalKilometers([{ location: 'Galle' }, { location: 'Colombo' }])
assert(endsInColombo.total === 120 + 120, `Colombo finish should not double-count return, got ${endsInColombo.total}`)
assert(
  !endsInColombo.legs.some((leg) => leg.kind === 'return'),
  'no extra return leg when the last overnight is Colombo'
)

const sergeyTotals = calculateTotals(1850, [{ amount: 500, currency: 'USD', status: 'successful' }], 'USD')
assert(sergeyTotals.total === 1850, 'invoice total 1850')
assert(sergeyTotals.paid === 500, 'paid 500')
assert(sergeyTotals.balance === 1350, 'balance 1350')
assert(paymentStatus(1850, 0, null) === 'unpaid', 'unpaid when paid is 0')
assert(paymentStatus(1850, 500, null) === 'partially_paid', 'partially paid')
assert(paymentStatus(1850, 1850, null) === 'paid', 'paid in full')
assert(paymentStatus(1850, 500, '2026-08-01', Date.parse('2026-08-20T12:00:00Z')) === 'overdue', 'overdue after due date')
assert(invoiceStatus('draft', 'paid') === 'draft', 'draft stays draft until finalized')
assert(invoiceStatus('finalized', 'paid') === 'paid', 'finalized becomes paid')
assert(invoiceStatus('sent', 'partially_paid') === 'partially_paid', 'sent becomes partially paid')
assert(parseClientFacingPrice('USD 1,850').amount === 1850, 'parse package quote')
assert(parseClientFacingPrice('USD 1,850').currency === 'USD', 'parse currency')
assert(uniqueInOrder(['Sigiriya', 'Kandy', 'Ella', 'Yala', 'Mirissa', 'Sigiriya']).join(',') === 'Sigiriya,Kandy,Ella,Yala,Mirissa', 'route unique in order')

const EMAIL_LOGO_URL = 'https://admin.lankalux.com/brand/lankalux-logo-email.jpg'

const invoiceEmail = renderInvoiceEmail({
  clientName: 'Sergey Ivanov',
  invoiceNumber: 'LL-INV-001',
  journeyTitle: 'Sri Lanka Discovery Journey',
  travelDates: '12-Sep-2026 – 20-Sep-2026',
  packageTotal: 'USD 1,850',
  balanceDue: 'USD 1,350',
  shareUrl: 'https://journey.lankalux.com/journey/abc',
  logoUrl: EMAIL_LOGO_URL,
})
assert(invoiceEmail.subject === 'LankaLux Invoice — LL-INV-001', 'invoice email subject')
assert(invoiceEmail.html.includes('View your LankaLux Journey'), 'invoice email uses itinerary CTA')
assert(invoiceEmail.html.includes('/brand/lankalux-logo-email.jpg'), 'invoice email uses opaque email logo')
assert(invoiceEmail.html.includes('href="https://lankalux.com"'), 'invoice logo links to lankalux.com')
assert(invoiceEmail.html.includes('align="center"'), 'invoice logo is table-centred')
assert(invoiceEmail.html.includes('F9F4EB'), 'invoice email uses ivory canvas')
assert(invoiceEmail.text.includes('Balance due USD 1,350'), 'invoice email text includes balance')

assert(normalizeEditableBody('Dear Anna,\n\nHello there.\n\nWarm regards,\nLankaLux Team') === 'Hello there.', 'strip greeting and signature')
assert(normalizeEditableBody('Just checking in.') === 'Just checking in.', 'plain body stays intact')

const followUpHtml = getTemplate('friendly_checkin')!.getHtml({
  clientName: 'Anna Silva',
  logoUrl: EMAIL_LOGO_URL,
})
assert(followUpHtml.includes('F9F4EB'), 'follow-up uses ivory canvas')
assert(followUpHtml.includes('B18544'), 'follow-up uses gold rule')
assert(followUpHtml.includes('1A2A1D'), 'follow-up uses forest')
assert(followUpHtml.includes('/brand/lankalux-logo-email.jpg'), 'follow-up uses opaque email logo')
assert(followUpHtml.includes('href="https://lankalux.com"'), 'follow-up logo links to lankalux.com')
assert(followUpHtml.includes('align="center"'), 'follow-up logo is table-centred')
assert(!followUpHtml.includes('Georgia'), 'follow-up does not use old serif chrome')
assert(!followUpHtml.includes('#c8a45d'), 'follow-up does not use old gold')
assert(!followUpHtml.includes('View your itinerary'), 'follow-up has no itinerary CTA')

const followUpCompiled = renderFollowUpEmail({
  clientName: 'Anna Silva',
  bodyText: 'Hello there.',
  logoUrl: EMAIL_LOGO_URL,
})
assert(followUpCompiled.html.includes('Hello there.'), 'follow-up includes body')
assert(followUpCompiled.text.includes('Private journeys, exceptional care'), 'follow-up uses brand tagline')

const postTripCta = followUpCta('post_trip_feedback')
const postTripCtas = followUpCtas('post_trip_feedback')
assert(postTripCta?.ctaUrl === GOOGLE_REVIEW_URL, 'post-trip primary CTA is the Google review link')
assert(postTripCta?.ctaLabel === 'Leave a Google review', 'post-trip primary CTA label')
assert(postTripCtas.length === 2, 'post-trip email has Google and Trustpilot CTAs')
assert(postTripCtas[1]?.ctaUrl === TRUSTPILOT_REVIEW_URL, 'post-trip second CTA is the Trustpilot review link')
assert(postTripCtas[1]?.ctaLabel === 'Leave a Trustpilot review', 'post-trip Trustpilot CTA label')
assert(followUpCtas('friendly_checkin').length === 0, 'other follow-up templates have no review CTAs')
const postTripHtml = getTemplate('post_trip_feedback')!.getHtml({
  clientName: 'Anna Silva',
  logoUrl: EMAIL_LOGO_URL,
})
assert(postTripHtml.includes(GOOGLE_REVIEW_URL), 'post-trip email includes Google review URL')
assert(postTripHtml.includes('Leave a Google review'), 'post-trip email includes Google review button')
assert(postTripHtml.includes(TRUSTPILOT_REVIEW_URL), 'post-trip email includes Trustpilot review URL')
assert(postTripHtml.includes('Leave a Trustpilot review'), 'post-trip email includes Trustpilot review button')
assert(postTripHtml.includes('Google or Trustpilot'), 'post-trip copy mentions both review sites')
assert(postTripHtml.includes('/brand/lankalux-logo-email.jpg'), 'post-trip uses opaque email logo')
assert(postTripHtml.includes('href="https://lankalux.com"'), 'post-trip logo links to lankalux.com')
assert(!postTripHtml.includes('mailto:hello@lankalux.com'), 'post-trip CTA is not the old mailto')
const postTripText = getTemplate('post_trip_feedback')!.getText({ clientName: 'Anna Silva' })
assert(postTripText.includes('Google or Trustpilot'), 'post-trip plain text mentions both review sites')
assert(followUpBcc('post_trip_feedback') === TRUSTPILOT_AFS_BCC, 'post-trip BCC is the Trustpilot AFS address')
assert(followUpBcc('friendly_checkin') === null, 'other follow-up templates are not BCCd to Trustpilot')
assert(followUpBcc('custom_email') === null, 'custom emails are not BCCd to Trustpilot')
const afsHtml = renderFollowUpEmail({
  clientName: 'Anna Silva',
  bodyText: 'Hello there.',
  logoUrl: EMAIL_LOGO_URL,
  extraHtml: trustpilotAfsSnippet({
    recipientName: 'Anna Silva',
    recipientEmail: 'anna@example.com',
    referenceId: 'req-id-123',
  }),
}).html
assert(afsHtml.includes('application/json+trustpilot'), 'AFS snippet is in the HTML source')
assert(afsHtml.includes('anna@example.com'), 'AFS snippet includes the guest email')
assert(afsHtml.includes('req-id-123'), 'AFS snippet includes the request id')
assert(!afsHtml.includes(TRUSTPILOT_AFS_BCC), 'AFS BCC address is not shown in the email body')

const classicPlaces = placesForJourney({
  destinations: 'Sigiriya → Kandy → Ella → Yala → Mirissa',
})
assert(
  classicPlaces.regions.some((r) => r.id === 'cultural-triangle'),
  'classic route includes the cultural triangle'
)
assert(
  classicPlaces.corridors.some((c) => c.id === 'kandy-tea' || c.id === 'tea-ella' || c.id === 'triangle-kandy'),
  'classic route includes hill-country transfer corridors'
)
assert(
  classicPlaces.corridors.some((c) => c.stops.some((s) => /ramboda/i.test(s.name))),
  'Kandy to tea country should surface Ramboda as an en-route stop'
)
assert(
  classicPlaces.corridors.some((c) => c.stops.some((s) => /nine arches/i.test(s.name))),
  'tea to Ella should surface Nine Arches'
)
assert(
  !JSON.stringify(classicPlaces).toLowerCase().includes('olanka'),
  'place book must not mention competitor names'
)

const southOnly = placesForJourney({ destinations: 'Galle and Bentota' })
assert(
  southOnly.regions.every((r) => ['south-coast', 'west-coast', 'colombo'].includes(r.id)),
  'a south-west request should not pull the whole island catalog'
)
assert(
  southOnly.corridors.some((c) => c.stops.some((s) => /madu/i.test(s.name) || /kosgoda/i.test(s.name))),
  'south-west drive should include Madu Ganga or Kosgoda'
)

const prompt = buildItineraryPrompt(
  {
    id: 'req-id-test',
    client_name: 'Test Client',
    email: 'test@example.com',
    whatsapp: null,
    origin_country: 'Australia',
    start_date: '2026-09-12',
    end_date: '2026-09-21',
    duration: 10,
    number_of_adults: 2,
    number_of_children: 2,
    children_ages: JSON.stringify([8, 11]),
    additional_preferences: 'Family pace, wildlife if it sits on the way',
    itineraryoptions: null,
    selected_option: null,
    public_token: null,
    status: 'new',
    cancellation_reason: null,
    notes: null,
    assigned_employee: null,
    lead_source: null,
    budget: null,
    hotel_preference: null,
    vehicle_preference: null,
    special_requirements: null,
    interests: 'culture, tea, coast',
    arrival_flight: null,
    departure_flight: null,
    requested_destinations: 'Sigiriya → Kandy → Ella → Yala → Mirissa',
    selected_itinerary_id: null,
    published_itinerary_id: null,
    sent_at: null,
    last_sent_at: null,
    email_sent_count: null,
    hotel_options: null,
    created_at: '2026-09-08T00:00:00Z',
    updated_at: null,
  },
  'balanced',
  10
)
assert(prompt.includes('En route:'), 'prompt asks for En route prefixes')
assert(prompt.includes('Ramboda Falls'), 'prompt includes Ramboda as a named stop')
assert(prompt.includes('Peradeniya'), 'prompt includes Peradeniya on the triangle-to-Kandy drive')
assert(prompt.includes('Do not copy competitor wording'), 'prompt forbids copying competitor copy')
assert(!prompt.toLowerCase().includes('olanka'), 'generated prompt must not name the competitor')
assert(prompt.includes('at least 4'), 'prompt requires at least four activities per day')
assert(prompt.includes('HARD MINIMUM'), 'prompt states a hard activity minimum')
assert(enRouteDesignRules('relaxed').includes('at least 4 timed, named activities'), 'relaxed days still need four activities')
assert(enRouteDesignRules('experience').includes('at least 4 timed, named activities'), 'experience days still need four activities')
assert(prompt.includes('Stays are optional'), 'prompt keeps hotels optional when none are attached')
assert(hotelsPromptSection([]).includes('Do not invent hotel names'), 'empty hotel section forbids invented names')

const sampleDays = [
  {
    day: 1,
    date: '',
    location: 'Sigiriya',
    overnight_location: 'Sigiriya',
    title: 'Rock fortress',
    description: 'Climb in the morning.',
    activities: ['08:00 AM - Sigiriya Rock'],
    optional_activities: [],
    travel: { from: '', to: '', estimated_distance: '', estimated_duration: '' },
    recommended_images: [],
  },
  {
    day: 2,
    date: '',
    location: 'Kandy',
    overnight_location: 'Kandy',
    title: 'Temple',
    description: 'The tooth relic.',
    activities: ['10:00 AM - Temple of the Tooth'],
    optional_activities: [],
    travel: { from: '', to: '', estimated_distance: '', estimated_duration: '' },
    recommended_images: [],
  },
  {
    day: 3,
    date: '',
    location: 'Kandy',
    overnight_location: 'Kandy',
    title: 'Gardens',
    description: 'Peradeniya in the morning.',
    activities: ['09:00 AM - Botanic gardens'],
    optional_activities: [],
    travel: { from: '', to: '', estimated_distance: '', estimated_duration: '' },
    recommended_images: [],
  },
]
const filledDays = ensureMinimumDayActivities(sampleDays)
assert(
  filledDays.every((day) => day.activities.length >= 4),
  'thin generated days are padded to at least four activities'
)
assert(
  filledDays[0].activities.some((line) => /dambulla|pidurangala|village|polonnaruwa|hurulu|kaludiya/i.test(line)),
  'Sigiriya day is filled with nearby cultural-triangle places'
)
assert(
  filledDays[1].activities.some((line) => /lake|udawattakele|market|bahirawakanda|embakke|gadaladeniya/i.test(line)),
  'Kandy day is filled with nearby Kandy places'
)
const untouched = applyHotelsToDays(sampleDays, [])
assert(untouched.matchCount === 0, 'no hotels means no matches')
assert(untouched.days[0].hotel_id == null, 'days stay hotel-free when none attached')

const withStays = applyHotelsToDays(sampleDays, [
  { id: 'h-sig', name: 'Aliya Resort', destination: 'Sigiriya', star_category: '5', meal_plan: 'Half board' },
  { id: 'h-k1', name: 'Earl’s Regency', destination: 'Kandy', star_category: '5' },
  { id: 'h-k2', name: 'Theva Residency', destination: 'Kandy', star_category: 'Boutique' },
])
assert(withStays.matchCount === 3, 'three overnight days should receive stays')
assert(withStays.days[0].hotel_name === 'Aliya Resort', 'Sigiriya day gets the Sigiriya hotel')
assert(withStays.days[0].description.includes('Overnight at Aliya Resort'), 'stay line is inserted')
assert(withStays.days[1].hotel_id === 'h-k1', 'first Kandy night uses the first Kandy hotel')
assert(withStays.days[2].hotel_id === 'h-k2', 'second Kandy night uses the other Kandy hotel')
assert(!withStays.days.some((d) => d.location === 'Kandy' && d.hotel_name === 'Aliya Resort'), 'Sigiriya hotel must not land on Kandy')

const hotelPrompt = hotelsPromptSection([
  { id: 'h-sig', name: 'Aliya Resort', destination: 'Sigiriya', star_category: '5' },
])
assert(hotelPrompt.includes('Aliya Resort'), 'attached hotels are named in the prompt')
assert(hotelPrompt.includes('optional extras'), 'attached hotels stay optional')

const names = splitGuestNames('Sergey & Tatyana')
assert(names.length === 2 && names[0] === 'Sergey' && names[1] === 'Tatyana', 'guest names split for paging board')
const files = driverPackFilenames({ guestNames: names, startDate: '2026-09-12', endDate: '2026-09-20' })
assert(files.journey === 'LankaLux_Driver_Journey_Sergey_Tatyana_12-20_Sep_2026.pdf', 'journey filename')
assert(files.log === 'LankaLux_Driver_Log_Sergey_Tatyana_12-20_Sep_2026.pdf', 'log filename')
assert(files.paging === 'LankaLux_Paging_Board_Sergey_Tatyana.pdf', 'paging filename')
assert(sanitizeFilename('Sergey / Tatyana:*?') === 'Sergey_Tatyana', 'illegal filename characters stripped')
assert(googleMapsSearchUrl('Agandau House', 'Negombo').includes('google.com/maps/search'), 'maps link is a standard Google search URL')

const trainDay = {
  day: 5,
  date: '2026-09-16',
  location: 'Ella',
  overnight_location: 'Ella',
  title: 'Nanu Oya to Ella by train',
  description: 'Guests take the hill-country train. Vehicle meets them in Ella.',
  activities: ['Morning transfer to Nanu Oya station', 'Train to Ella'],
  optional_activities: [],
  travel: { from: 'Nuwara Eliya', to: 'Ella', estimated_distance: '50 km', estimated_duration: '' },
  recommended_images: [],
}
const train = detectTrainOperation(trainDay)
assert(train?.kind === 'train', 'train day is detected')
assert(train?.trainNumber === TBC, 'missing train numbers stay TBC')
assert(train?.notes.some((line) => /does not travel on the train/i.test(line)), 'vehicle does not travel on the train')

const originalActivities = [...trainDay.activities]
const stops = operationalStopsForDay(trainDay)
assert(stops.length > 0, 'en-route operational stops are suggested')
assert(JSON.stringify(trainDay.activities) === JSON.stringify(originalActivities), 'driver pack must not mutate itinerary activities')

const packed = buildDriverPackData({
  form: {
    guestNames: 'Sergey & Tatyana',
    startDate: '2026-09-12',
    endDate: '2026-09-20',
    chauffeurName: 'Sameera Prabath',
    chauffeurPhone: '',
    vehicleName: 'Toyota Voxy',
    vehicleRegistration: '',
    arrivalFlight: '',
    arrivalDate: '2026-09-12',
    arrivalTime: '',
    departureFlight: '',
    departureDate: '2026-09-20',
    departureTime: '',
    notes: '',
  },
  itinerary: {
    id: 'it-1',
    request_id: 'LLX001',
    option_number: 1,
    style: 'balanced',
    status: 'draft',
    is_selected: true,
    title: 'Classic',
    summary: '',
    duration: '9 days',
    payload: {
      title: 'Classic',
      summary: '',
      duration: '9 days',
      days: [
        {
          day: 1,
          date: '2026-09-12',
          location: 'Negombo',
          overnight_location: 'Negombo',
          title: 'Arrival',
          description: 'Airport to Negombo',
          activities: ['Airport meet'],
          optional_activities: [],
          travel: { from: 'Airport', to: 'Negombo', estimated_distance: '30 km', estimated_duration: '45 minutes' },
          recommended_images: [],
          hotel_name: 'Agandau House',
        },
        {
          day: 2,
          date: '2026-09-13',
          location: 'Habarana',
          overnight_location: 'Habarana',
          title: 'Cultural triangle',
          description: 'Drive north',
          activities: ['Dambulla Cave Temple'],
          optional_activities: [],
          travel: { from: 'Negombo', to: 'Habarana', estimated_distance: '170 km', estimated_duration: '' },
          recommended_images: [],
          hotel_name: 'Elephant Fence Habarana',
        },
      ],
    },
    vehicle_id: 'voxy',
    internal_notes: '',
    prompt_version: null,
    model: null,
    error: null,
    created_at: '',
    updated_at: '',
  },
  hotels: [{ id: 'h1', name: 'Agandau House', destination: 'Negombo', description: '15/A/A Basiyawatta, Thalahena, Negombo', contact: null, website: null }],
})
assert(packed.pagingReady === true, 'paging board only needs guest names')
assert(packed.missing.includes('Vehicle registration'), 'registration can be missing without blocking paging')
assert(packed.missing.includes('Arrival flight'), 'arrival flight is listed when missing')
assert(packed.logRows[0].routeDuty.toLowerCase().includes('airport'), 'log starts at the airport')
assert(packed.logRows.every((row) => !/fuel/i.test(row.routeDuty)), 'log rows do not mention fuel')
assert(packed.days[1].hotel?.name === 'Elephant Fence Habarana', 'tonight hotel comes from the sold itinerary')
assert(packed.days[1].stops.every((stop) => stop.classification !== undefined), 'stops are classified')
assert(!JSON.stringify(packed).toLowerCase().includes('fuel cost'), 'driver pack data has no fuel fields')

console.log('console core checks passed')
