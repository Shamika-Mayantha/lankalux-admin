import { parseItineraryJson } from '../validation/itinerary.schema'
import { assignDayImages, matchDestination } from '../services/image-map.service'

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

console.log('console core checks passed')
