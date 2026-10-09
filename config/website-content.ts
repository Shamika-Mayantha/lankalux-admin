/**
 * Content on lankalux.com that admin can manage from /console/website.
 * A photo slot's `path` is the original file in the Shamika-Mayantha/lankalux repo;
 * the website replaces every use of that path with the override saved in Supabase.
 */

export type WebsitePhotoSlot = {
  path: string
  section: string
  label: string
  usedOn: string[]
}

export const WEBSITE_ORIGIN = 'https://lankalux.com'

export const WEBSITE_REVIEW_PAGES = [
  { key: 'home', label: 'Homepage' },
  { key: 'signature-journey', label: 'Signature Journey' },
  { key: 'hill-country-journey', label: 'Hill Country Journey' },
  { key: 'nature-wildlife-journey', label: 'Nature & Wildlife Journey' },
  { key: 'coastal-retreat-journey', label: 'Coastal Retreat Journey' },
] as const

export type WebsiteReviewPage = (typeof WEBSITE_REVIEW_PAGES)[number]['key']

export function isWebsiteReviewPage(value: unknown): value is WebsiteReviewPage {
  return WEBSITE_REVIEW_PAGES.some((p) => p.key === value)
}

export const WEBSITE_PHOTO_SLOTS: WebsitePhotoSlot[] = [
  { path: 'images/coastalretreat/coastalhp.jpg', section: 'Coastal Retreat Journey', label: 'Cover', usedOn: ['Coastal Retreat Journey', 'Galle', 'Homepage', 'Journeys'] },
  { path: 'images/coastalretreat/day1.jpg', section: 'Coastal Retreat Journey', label: 'Day 1', usedOn: ['Coastal Retreat Journey', 'Homepage'] },
  { path: 'images/coastalretreat/day2.jpg', section: 'Coastal Retreat Journey', label: 'Day 2', usedOn: ['Coastal Retreat Journey'] },
  { path: 'images/coastalretreat/day3.jpg', section: 'Coastal Retreat Journey', label: 'Day 3', usedOn: ['Coastal Retreat Journey'] },
  { path: 'images/coastalretreat/day6.jpg', section: 'Coastal Retreat Journey', label: 'Day 6', usedOn: ['Coastal Retreat Journey'] },
  { path: 'images/coastalretreat/day7.jpg', section: 'Coastal Retreat Journey', label: 'Day 7', usedOn: ['Coastal Retreat Journey', 'Galle', 'Homepage'] },
  { path: 'images/fleet/flatroof1.jpg', section: 'Fleet', label: 'KDH Flat Roof 1', usedOn: ['Homepage'] },
  { path: 'images/fleet/flatroof2.jpg', section: 'Fleet', label: 'KDH Flat Roof 2', usedOn: ['Homepage'] },
  { path: 'images/fleet/flatroof3.jpg', section: 'Fleet', label: 'KDH Flat Roof 3', usedOn: ['Homepage'] },
  { path: 'images/fleet/highroof1.jpg', section: 'Fleet', label: 'KDH High Roof 1', usedOn: ['Homepage'] },
  { path: 'images/fleet/highroof2.jpg', section: 'Fleet', label: 'KDH High Roof 2', usedOn: ['Homepage'] },
  { path: 'images/fleet/highroof3.jpg', section: 'Fleet', label: 'KDH High Roof 3', usedOn: ['Homepage'] },
  { path: 'images/fleet/partybus1.jpg', section: 'Fleet', label: 'Party Bus 1', usedOn: ['Homepage'] },
  { path: 'images/fleet/partybus2.jpg', section: 'Fleet', label: 'Party Bus 2', usedOn: ['Homepage'] },
  { path: 'images/fleet/partybus3.jpg', section: 'Fleet', label: 'Party Bus 3', usedOn: ['Homepage'] },
  { path: 'images/fleet/safarijeep.jpg', section: 'Fleet', label: 'Safari jeep', usedOn: ['Homepage'] },
  { path: 'images/fleet/sedan1.jpg', section: 'Fleet', label: 'Sedan 1', usedOn: ['Homepage'] },
  { path: 'images/fleet/sedan2.jpg', section: 'Fleet', label: 'Sedan 2', usedOn: ['Homepage'] },
  { path: 'images/fleet/sedan3.jpg', section: 'Fleet', label: 'Sedan 3', usedOn: ['Homepage'] },
  { path: 'images/fleet/voxy1.jpg', section: 'Fleet', label: 'Toyota Voxy 1', usedOn: ['Chauffeur Guide Vs Self Driving', 'Homepage', 'Private Chauffeur Guide Sri Lanka', 'Sri Lanka Family Tours', 'Sri Lanka With Children'] },
  { path: 'images/fleet/voxy2.jpg', section: 'Fleet', label: 'Toyota Voxy 2', usedOn: ['Homepage'] },
  { path: 'images/fleet/voxy3.jpg', section: 'Fleet', label: 'Toyota Voxy 3', usedOn: ['Homepage'] },
  { path: 'images/highlights/beach/arugambay.jpg', section: 'Highlights: Beach', label: 'Arugam Bay', usedOn: ['Homepage'] },
  { path: 'images/highlights/beach/mirissa.jpg', section: 'Highlights: Beach', label: 'Mirissa', usedOn: ['Best Time To Visit Sri Lanka', 'Coastal Retreat Journey', 'Galle', 'Homepage', 'Mirissa', 'Signature Journey'] },
  { path: 'images/highlights/beach/platter.jpg', section: 'Highlights: Beach', label: 'Seafood platter', usedOn: ['Coastal Retreat Journey', 'Homepage', 'Signature Journey'] },
  { path: 'images/highlights/cultural/atamasthana.jpg', section: 'Highlights: Cultural', label: 'Atamasthana', usedOn: ['Homepage', 'Signature Journey'] },
  { path: 'images/highlights/cultural/kandy.jpg', section: 'Highlights: Cultural', label: 'Kandy', usedOn: ['Ella', 'Homepage', 'Kandy', 'Sigiriya', 'Signature Journey'] },
  { path: 'images/highlights/cultural/sigirya.jpg', section: 'Highlights: Cultural', label: 'Sigiriya', usedOn: ['Homepage', 'Sigiriya', 'Signature Journey'] },
  { path: 'images/highlights/tea/damrotea.jpg', section: 'Highlights: Tea', label: 'Damro tea', usedOn: ['Homepage', 'Signature Journey'] },
  { path: 'images/highlights/tea/gregorylake.jpg', section: 'Highlights: Tea', label: 'Gregory Lake', usedOn: ['Homepage'] },
  { path: 'images/highlights/tea/stclairs.jpg', section: 'Highlights: Tea', label: "St Clair's", usedOn: ['Homepage'] },
  { path: 'images/highlights/wildlife/bear.jpg', section: 'Highlights: Wildlife', label: 'Bear', usedOn: ['Homepage'] },
  { path: 'images/highlights/wildlife/elephant.jpg', section: 'Highlights: Wildlife', label: 'Elephant', usedOn: ['Homepage', 'Signature Journey', 'Udawalawe', 'Yala'] },
  { path: 'images/highlights/wildlife/leopard.jpg', section: 'Highlights: Wildlife', label: 'Leopard', usedOn: ['Homepage', 'Signature Journey', 'Yala', 'Yala Vs Udawalawe'] },
  { path: 'images/hillcountry/day1.jpg', section: 'Hill Country Journey', label: 'Day 1', usedOn: ['Hill Country Journey'] },
  { path: 'images/hillcountry/day2.jpg', section: 'Hill Country Journey', label: 'Day 2', usedOn: ['Hill Country Journey'] },
  { path: 'images/hillcountry/day3.jpg', section: 'Hill Country Journey', label: 'Day 3', usedOn: ['Hill Country Journey', 'Homepage'] },
  { path: 'images/hillcountry/day4.jpg', section: 'Hill Country Journey', label: 'Day 4', usedOn: ['Hill Country Journey', 'Homepage'] },
  { path: 'images/hillcountry/day5.jpg', section: 'Hill Country Journey', label: 'Day 5', usedOn: ['Hill Country Journey'] },
  { path: 'images/hillcountry/day6.jpg', section: 'Hill Country Journey', label: 'Day 6', usedOn: ['Hill Country Journey'] },
  { path: 'images/hillcountry/day7.jpg', section: 'Hill Country Journey', label: 'Day 7', usedOn: ['Hill Country Journey'] },
  { path: 'images/hillcountry/hillcountryhp.jpg', section: 'Hill Country Journey', label: 'Cover', usedOn: ['Ella', 'Hill Country Journey', 'Homepage', 'Journeys', 'Sri Lanka Hill Country Train'] },
  { path: 'images/homepage/homepage1.jpg', section: 'Homepage slideshow', label: 'Slide 1', usedOn: ['Homepage', 'Tailor Made Sri Lanka Tours'] },
  { path: 'images/homepage/homepage2.jpg', section: 'Homepage slideshow', label: 'Slide 2', usedOn: ['Homepage', 'Journeys'] },
  { path: 'images/homepage/homepage3.jpg', section: 'Homepage slideshow', label: 'Slide 3', usedOn: ['Homepage'] },
  { path: 'images/homepage/homepage4.jpg', section: 'Homepage slideshow', label: 'Slide 4', usedOn: ['Homepage'] },
  { path: 'images/homepage/homepage5.png', section: 'Homepage slideshow', label: 'Slide 5', usedOn: ['Homepage'] },
  { path: 'images/homepage/homepage6.jpg', section: 'Homepage slideshow', label: 'Slide 6', usedOn: ['Homepage'] },
  { path: 'images/naturewildlife/day2.jpg', section: 'Nature & Wildlife Journey', label: 'Day 2', usedOn: ['Homepage', 'Nature Wildlife Journey'] },
  { path: 'images/naturewildlife/day3.jpg', section: 'Nature & Wildlife Journey', label: 'Day 3', usedOn: ['Homepage', 'Nature Wildlife Journey'] },
  { path: 'images/naturewildlife/day4.jpg', section: 'Nature & Wildlife Journey', label: 'Day 4', usedOn: ['Nature Wildlife Journey'] },
  { path: 'images/naturewildlife/day5.jpg', section: 'Nature & Wildlife Journey', label: 'Day 5', usedOn: ['Nature Wildlife Journey'] },
  { path: 'images/naturewildlife/day6.jpg', section: 'Nature & Wildlife Journey', label: 'Day 6', usedOn: ['Nature Wildlife Journey'] },
  { path: 'images/naturewildlife/day7.jpg', section: 'Nature & Wildlife Journey', label: 'Day 7', usedOn: ['Nature Wildlife Journey'] },
  { path: 'images/naturewildlife/day8.jpg', section: 'Nature & Wildlife Journey', label: 'Day 8', usedOn: ['Nature Wildlife Journey'] },
  { path: 'images/naturewildlife/wildlifehp1.jpg', section: 'Nature & Wildlife Journey', label: 'Cover', usedOn: ['Homepage', 'Journeys', 'Nature Wildlife Journey', 'Yala'] },
  { path: 'images/signaturejourney/depart.jpg', section: 'Signature Journey', label: 'Departure', usedOn: ['Coastal Retreat Journey', 'Hill Country Journey', 'Nature Wildlife Journey', 'Signature Journey'] },
  { path: 'images/signaturejourney/sigjhp1.jpg', section: 'Signature Journey', label: 'Cover', usedOn: ['10 Day Sri Lanka Itinerary', 'Homepage', 'How Many Days In Sri Lanka', 'Journeys', 'Sigiriya', 'Signature Journey'] },
  { path: 'images/signaturejourney/sigjourneycmb.jpg', section: 'Signature Journey', label: 'Colombo', usedOn: ['Nature Wildlife Journey', 'Signature Journey'] },
]

export function isWebsitePhotoPath(value: unknown): boolean {
  return WEBSITE_PHOTO_SLOTS.some((slot) => slot.path === value)
}
