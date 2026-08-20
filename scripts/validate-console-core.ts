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

console.log('console core checks passed')
