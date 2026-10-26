import { STYLE_META, type ItineraryStyle } from '@/config/status'
import {
  formatPlacesCatalog,
  placesForJourney,
} from '@/config/sri-lanka-places'
import type { ClientRequestRow } from '@/types/domain'
import { hotelsPromptSection, type StayCandidate } from '@/services/hotel-match.service'

function parseChildrenAges(raw: string | null | undefined): number[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.map((n) => parseInt(String(n), 10)).filter((n) => Number.isFinite(n))
  } catch {
    return []
  }
}

const STYLE_INSTRUCTIONS: Record<ItineraryStyle, string> = {
  balanced:
    'Create the RECOMMENDED, well-paced itinerary. Mix culture, scenery, wildlife and rest in equal measure. This is the default proposal LankaLux would proudly send.',
  relaxed:
    'Create a RELAXED, comfort-focused itinerary. Fewer hotel changes and longer stays, shorter drives, spa and beach time, scenic rather than strenuous days. Still cover the requested places without rushing.',
  experience:
    'Create an EXPERIENCE / EXPLORATION itinerary. Lean into wildlife, walks, the hill-country train, village life, local food and lesser-known places. Keep driving realistic and never sacrifice sleep for sightseeing.',
}

const STYLE_STOP_DENSITY: Record<ItineraryStyle, string> = {
  balanced:
    'Every day: at least 4 named activities. Transfer days: 2 of those must be En route: places on that road. Stay days: 4 to 6 highlights including nearby lesser-known stops, with real breathing room.',
  relaxed:
    'Every day: at least 4 named activities. Transfer days: 2 scenic En route: pauses and a gentle arrival. Stay days: 4 or 5 highlights with a long lunch or a slow afternoon at the hotel. Never stack climbs.',
  experience:
    'Every day: at least 4 named activities. Transfer days: 2 to 4 distinctive En route: stops (train, village, walk, lesser-known shrine). Stay days: 5 to 7 highlights. Still finish before guests are exhausted.',
}

const STYLE_BASES: Record<ItineraryStyle, string> = {
  balanced: 'about one overnight base per two or three nights',
  relaxed: 'as few bases as the route allows, three nights where it makes sense',
  experience: 'about one base per two nights, with one-night stops only to break a long drive',
}

export function formatDate(iso: string | null) {
  if (!iso) return 'Not specified'
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

/** What the weather and the parks are doing in the travel month, so the route suits the season. */
export function seasonNotes(startIso: string | null): string {
  if (!startIso) return ''
  const month = new Date(`${startIso}T00:00:00`).getMonth() + 1
  const notes: string[] = []
  if (month === 12 || month <= 3) {
    notes.push('Dry season on the south and west coasts and in the hill country: the classic loop and southern beaches are at their best.')
    notes.push('The east coast (Trincomalee, Pasikudah, Arugam Bay) is in its rainy season. Do not plan beach stays there.')
    notes.push('Whale watching from Mirissa is in season.')
  } else if (month === 4) {
    notes.push('Shoulder month: both coasts can work. The south is still good early in the month; the east coast is coming into season.')
    notes.push('Mid April is Sinhala and Tamil New Year: a lovely time for village life, and some places close for a day or two.')
  } else if (month >= 5 && month <= 9) {
    notes.push('South west monsoon: the south and west coasts are rough and rainy. For beach days prefer the east coast (Trincomalee, Pasikudah, or Arugam Bay for surfers).')
    notes.push('The Cultural Triangle and the east are dry. Whale and dolphin trips run from Trincomalee, not Mirissa.')
    if (month >= 7) notes.push('July to September is the elephant gathering at Minneriya and Kaudulla.')
    if (month >= 7 && month <= 8) notes.push('Kandy Esala Perahera usually falls in July or August: worth an evening if the dates match.')
    if (month === 9) notes.push('Yala usually closes for some weeks from September: prefer Udawalawe or Bundala for safari.')
  } else {
    notes.push('Inter monsoon: short heavy showers anywhere, usually later in the day. Plan outdoor highlights for the first half of the day in the wording, without clock times.')
    if (month === 10) notes.push('Yala often reopens only in mid October: prefer Udawalawe or Bundala for safari early in the month.')
    notes.push('The south and west coasts are settling into their dry season by late November; the east is turning wet.')
  }
  return `SEASON (travel month: ${new Date(`${startIso}T00:00:00`).toLocaleDateString('en-US', { month: 'long' })})\n${notes.map((n) => `- ${n}`).join('\n')}`
}

export function routeRules(style: ItineraryStyle): string {
  return `ROUTE (plan this before writing a single day)
1. Choose the overnight bases first, then put them in ONE geographic sweep: a loop or a line from the arrival point to the departure point. The guests never sleep twice in a region they have left, and the car never drives back the way it came.
2. Proven sweeps (or the same run in reverse):
   - Classic loop: Airport or Negombo > Sigiriya / Dambulla > Kandy > Nuwara Eliya > Ella > Yala / Tissa > Mirissa or Galle > Bentota > Airport
   - Hills and south only: Airport > Kandy > Nuwara Eliya > Ella > Yala / Tissa > south coast > Airport
   - Culture and east coast (May to September): Airport > Wilpattu or Anuradhapura > Trincomalee or Pasikudah > Sigiriya / Habarana > Kandy > Airport
   Short trips cover less ground. Never criss-cross the island to fit everything in.
3. Bases: ${STYLE_BASES[style]}. One-night stops only where a long drive needs breaking.
4. At most one hotel change per day and roughly 5 hours of road at most. The Nanu Oya or Kandy to Ella train counts as that day's transfer.
5. Inside each day the activities run in the order the car reaches them: start where the guests woke up, end where they sleep. On a transfer day every En route: stop lies on or just off that day's road, between the two towns. Never list a place the car has already passed, and never drive past tonight's base to see something and come back.
6. On a stay day everything is within about an hour of the base.
7. Arrival day is light (guests are tired from the flight). Departure day only holds what sits on the way to the airport.
A computer check reads every itinerary against the map and rejects any route that doubles back.`
}

export function enRouteDesignRules(style: ItineraryStyle): string {
  return `ALONG-THE-WAY DESIGN (this is what makes a LankaLux day feel complete)
- A day is not only the overnight town. On every transfer, weave in the worthwhile places that sit ON THAT ROAD: waterfalls, working tea factories, gardens, cave temples, village tanks, viewpoints, bridges, hatcheries, mangrove boats. Also add lesser-known places a short detour off the day's route.
- ${STYLE_STOP_DENSITY[style]}
- HARD MINIMUM: every day's "activities" array must contain at least 4 named items that geographically match that day (overnight town, nearby sights, or the road being driven). Arrival and departure days still need 4: the airport welcome, a city or coast pause, and two named nearby stops.
- NO CLOCK TIMES anywhere: no "09:00 AM", no "14:30", no "Morning:" labels, no "(if time allows)". Each activity is one plain sentence that starts with the place or the action. Words like "at first light" or "for sunset" are fine only where the moment really matters (a dawn safari, a sunset viewpoint).
- Prefix roadside or nearby pauses with "En route:" so the client can see them in the highlights list. Example: "En route: Ramboda Falls, a cascade beside the tea-country hairpins, ten minutes from the car."
- Name the specific place. Never write "scenic drive", "free time", "leisure at hotel" or "visit local attractions" without a proper place name.
- Choose the best-fit stops for this party's ages, energy and interests. Prefer real lesser-known places over repeating the same headline twice.
- Optional_activities are extras if the mood allows: a second walk, a cultural show, a garden, a boat. They must be real named places near that day and do not count toward the 4 required activities.
- One headline experience per day (the fortress, the temple, the safari, the train). Supporting stops sit around it, not in competition with it.
- Ethical wildlife only: observation and conservation. No elephant riding, no bathing shows, no handling baby turtles for photos.
- Do not invent hotels. Do not copy competitor wording, hotel names, meal-plan labels, or shopping-mall lists.`
}

export const VOICE_RULES = `VOICE
- Write like a LankaLux consultant who has driven these roads many times: warm, specific and calm. Short clear sentences. Plain words.
- Every sentence should hold a real detail: what the guests will see, taste or hear, why this place matters, or a practical tip (wear something that covers the shoulders at temples, the steps get busy, bring a light jacket for the hills).
- Day titles: 2 to 6 words, no "Day 1", no dates, for example "Into the Tea Country" or "Leopards at First Light".
- Summary: 2 or 3 sentences naming the route and what makes this version special.
- Never use these words or phrases: nestled, tapestry, embark, journey of a lifetime, breathtaking, vibrant, immerse, hidden gem, unforgettable, delve, boasts, testament, paradise, feast for the senses, unwind, rich history, a must-see, UNESCO World Heritage site (say what makes it special instead). No "Did you know?" trivia blocks. No exclamation marks.
- Never mention prices or costs.`

export function placesPromptSection(opts: {
  destinations?: string | null
  interests?: string | null
  notes?: string | null
}): string {
  const { regions, corridors } = placesForJourney(opts)
  const catalog = formatPlacesCatalog(regions, corridors)
  return `LANKALUX PLACE BOOK (use as a menu, not a script to paste)
Pick from these named stops when they sit on today's drive or in today's overnight region. Rebuild each day in LankaLux voice. You may add other genuine places that truly lie on the route. You may skip anything that does not fit the pace.

${catalog}`
}

export function buildItineraryPrompt(
  request: ClientRequestRow,
  style: ItineraryStyle,
  expectedDays: number,
  hotels: StayCandidate[] = [],
  otherOptions: { label: string; title: string; route: string }[] = []
) {
  const ages = parseChildrenAges(request.children_ages)
  const childLine =
    (request.number_of_children || 0) > 0
      ? `${request.number_of_children} child${(request.number_of_children || 0) > 1 ? 'ren' : ''}${ages.length ? ` aged ${ages.join(', ')}` : ''}`
      : 'no children'
  const meta = STYLE_META[style]
  const destinations = request.requested_destinations || 'Plan a classic Sri Lanka flow'
  const interests = request.interests || request.additional_preferences || 'None specified'
  const notes = [request.additional_preferences, request.special_requirements].filter(Boolean).join(' · ') || 'None'
  const youngest = ages.length ? Math.min(...ages) : null
  const season = seasonNotes(request.start_date)
  const variety = otherOptions.length
    ? `\nOTHER OPTIONS ALREADY MADE FOR THIS CLIENT (make this one feel clearly different in pace, bases or highlights, while still honouring the requested places)\n${otherOptions
        .map((o) => `- ${o.label}: ${o.title} (${o.route})`)
        .join('\n')}\n`
    : ''

  return `You are the senior journey designer at LankaLux, a Sri Lankan company that plans private, chauffeur-guided holidays.

Write ONE itinerary only, the ${meta.label}: ${meta.subtitle}.
${STYLE_INSTRUCTIONS[style]}

CLIENT
- Name: ${request.client_name || 'Guest'}
- Country: ${request.origin_country || 'Not specified'}
- Dates: ${formatDate(request.start_date)} to ${formatDate(request.end_date)}
- Duration: EXACTLY ${expectedDays} days (inclusive)
- Party: ${request.number_of_adults || 0} adults, ${childLine}
- Destinations requested: ${destinations}
- Interests: ${interests}
- Hotel preference: ${request.hotel_preference || 'Not specified'}
- Vehicle preference: ${request.vehicle_preference || 'Not specified'}
- Budget: ${request.budget || 'Not specified'}
- Special requirements: ${request.special_requirements || 'None'}
- Additional notes: ${request.additional_preferences || 'None'}
- Arrival flight: ${request.arrival_flight || 'Not specified'}
- Departure flight: ${request.departure_flight || 'Not specified'}
${youngest != null && youngest < 12 ? `- Youngest child is ${youngest}: keep walks short, drives broken up, and add things children enjoy (a boat, a train, animals seen ethically, a beach afternoon).\n` : ''}
Every requested destination and interest must appear somewhere in the plan, placed where it fits the sweep. Do not drop a request to make the route tidier: reorder the route instead.
${variety}
HARD RULES
- Return ONLY JSON. No markdown.
- The "days" array MUST contain exactly ${expectedDays} objects, day 1 = start date, last day = end date.
- "location" is the town where the guests sleep that night (on the last day, where they leave from). Use real town names, for example "Sigiriya", "Kandy", "Nuwara Eliya", "Ella", "Tissamaharama", "Mirissa", "Galle", "Bentota", "Negombo".
- "travel" is filled on every day the guests change base: from, to, estimated_distance (road km, e.g. "140 km") and estimated_duration (driving time, e.g. "about 4 hours"). On stay days leave travel empty.
- Do not invent hotels that must be booked; describe overnight towns only.
- Each day's "description" is 2 to 4 sentences of real place insight: what guests will see, the local character, and why this day is special. On a transfer day mention the best en-route pause.
- Do NOT include image URLs. The server maps photographs.

${routeRules(style)}

${season}

${enRouteDesignRules(style)}

${VOICE_RULES}

${placesPromptSection({ destinations, interests, notes })}

${hotelsPromptSection(hotels)}

JSON SHAPE
{
  "title": "",
  "summary": "",
  "duration": "${expectedDays} days",
  "days": [
    {
      "day": 1,
      "date": "",
      "location": "",
      "overnight_location": "",
      "title": "",
      "description": "",
      "activities": [
        "Headline named place for this day, with what makes it worth the time",
        "En route: a named place that sits on today's road",
        "A second named place in this region",
        "A third nearby stop: garden, temple, village or viewpoint"
      ],
      "optional_activities": ["Named extra nearby if the mood allows"],
      "travel": { "from": "", "to": "", "estimated_distance": "", "estimated_duration": "" }
    }
  ]
}`
}

export { STYLE_INSTRUCTIONS }
