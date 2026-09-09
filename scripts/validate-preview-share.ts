import assert from 'node:assert/strict'
import { journeyShareSchema } from '../validation/journey-share.schema'

const preview = {
  requestId: 'LL-001', clientName: 'Guest', email: 'private@example.com', whatsapp: 'private',
  title: 'The currently previewed option', summary: 'A custom route.',
  startDate: null, endDate: null, durationDays: 1, durationLabel: '1 day',
  party: { adults: 2, children: 0, childrenAges: [], internal_notes: 'private' },
  days: [{
    day: 1, date: '', location: 'Ella', overnight_location: 'Ella', title: 'Tea country',
    description: 'Preview description', activities: ['Walk'], optional_activities: [],
    recommended_images: ['https://example.com/ella.jpg'], internal_notes: 'private',
    travel: { from: 'Kandy', to: 'Ella', estimated_distance: '140 km', estimated_duration: '4 hours', cost: 'private' },
  }],
  vehicle: null, hotels: [], includedServices: ['Guide'], importantInformation: ['Bring walking shoes'],
  optionNumber: 3, style: 'experience', price: 'USD 1,200', totalKilometers: 140,
  internal_notes: 'private', shareToken: 'old-token',
}
const result = journeyShareSchema.parse(preview)
assert.equal(result.optionNumber, 3)
assert.equal(result.title, preview.title)
assert.equal(result.price, preview.price)
assert.equal(result.days[0].description, preview.days[0].description)
assert.deepEqual(result.days[0].recommended_images, preview.days[0].recommended_images)
assert.equal(result.email, null)
assert.equal(result.whatsapp, null)
assert.ok(!JSON.stringify(result).includes('private'))
assert.ok(!JSON.stringify(result).includes('old-token'))
assert.equal(journeyShareSchema.safeParse({ ...preview, days: [] }).success, false)
assert.equal(journeyShareSchema.safeParse({ ...preview, days: [{ ...preview.days[0], travel: null }] }).success, false)
console.log('preview share checks passed')
