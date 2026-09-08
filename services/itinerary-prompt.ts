import { STYLE_META, type ItineraryStyle } from '@/config/status'
import {
  formatPlacesCatalog,
  placesForJourney,
} from '@/config/sri-lanka-places'
import type { ClientRequestRow } from '@/types/domain'

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
    'Create the RECOMMENDED, well-paced itinerary. Mix culture, scenery and rest in equal measure. This is the default proposal LankaLux would proudly send.',
  relaxed:
    'Create a RELAXED, comfort-focused itinerary. Fewer hotel changes, later starts, spa and beach time, scenic rather than strenuous days. Still cover the requested route without rushing.',
  experience:
    'Create an EXPERIENCE / EXPLORATION itinerary. Lean into wildlife, walking, trains, local food and distinctive places. Keep driving realistic — never sacrifice sleep for sightseeing.',
}

const STYLE_STOP_DENSITY: Record<ItineraryStyle, string> = {
  balanced:
    'Transfer days: 2–3 named en-route stops. Stay days: 6–8 timed highlights. Leave real breathing room.',
  relaxed:
    'Transfer days: 1–2 scenic pauses only. Stay days: 5–7 timed highlights with a long lunch or hotel window. Never stack climbs.',
  experience:
    'Transfer days: 3–4 distinctive stops (train, village, walk, lesser-known shrine). Stay days: 7–9 timed highlights. Still finish before guests are exhausted.',
}

export function formatDate(iso: string | null) {
  if (!iso) return 'Not specified'
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

export function enRouteDesignRules(style: ItineraryStyle): string {
  return `ALONG-THE-WAY DESIGN (this is what makes a LankaLux day feel complete)
- A day is not only the overnight town. On every transfer, weave in the worthwhile places that sit ON THAT ROAD — waterfalls, working tea factories, gardens, cave temples, village tanks, viewpoints, bridges, hatcheries, mangrove boats.
- ${STYLE_STOP_DENSITY[style]}
- Prefix roadside pauses with "En route:" so the client can see them in the highlights list. Example: "10:30 AM - En route: pause at Ramboda Falls — a roadside cascade in the tea hairpins, ten minutes from the car."
- Name the specific place. Never write "scenic drive" or "visit local attractions" without a proper name.
- Choose the best-fit stops for this party's ages, energy and interests. Do not dump every possible sight onto one day.
- Optional_activities are the extras if time and mood allow — a second hike, a cultural show, a garden, a boat. They must also be real named places.
- One headline experience per day (the fortress, the temple, the safari, the train). Supporting stops sit around it, not in competition with it.
- Ethical wildlife only: observation and conservation. No elephant riding, no bathing shows, no handling baby turtles for photos.
- Do not invent hotels. Do not copy competitor wording, hotel names, meal-plan labels, or shopping-mall lists.
- Keep LankaLux tone: warm, precise, chauffeur-guided. Short clauses. No "Did you know?" trivia blocks. No UNESCO press-release language.`
}

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

export function buildItineraryPrompt(request: ClientRequestRow, style: ItineraryStyle, expectedDays: number) {
  const ages = parseChildrenAges(request.children_ages)
  const childLine =
    (request.number_of_children || 0) > 0
      ? `${request.number_of_children} child${(request.number_of_children || 0) > 1 ? 'ren' : ''}${ages.length ? ` aged ${ages.join(', ')}` : ''}`
      : 'no children'
  const meta = STYLE_META[style]
  const destinations = request.requested_destinations || 'Plan a classic Sri Lanka flow'
  const interests = request.interests || request.additional_preferences || 'None specified'
  const notes = [request.additional_preferences, request.special_requirements].filter(Boolean).join(' · ') || 'None'

  return `You are a luxury travel designer for LankaLux, a Sri Lankan tailor-made journey company.

Write ONE itinerary only — ${meta.label}: ${meta.subtitle}.
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

HARD RULES
- Return ONLY JSON. No markdown.
- The "days" array MUST contain exactly ${expectedDays} objects, day 1 = start date, last day = end date.
- Geographic flow in ONE direction. No backtracking (do not go north then south then north).
- At most one major location transfer per day.
- Do not invent hotels that must be booked; describe overnight towns only.
- Activities are timed strings in 12-hour format with AM/PM: "09:00 AM - Description".
- Each day "description" must include useful place insight (what guests will see, local character, and why this stop is special) in 2-4 clear sentences. Mention the most interesting en-route pause when it is a transfer day.
- Do NOT include image URLs. The server maps photographs.

${enRouteDesignRules(style)}

${placesPromptSection({ destinations, interests, notes })}

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
      "activities": ["08:00 AM - Timed highlight with a named place"],
      "optional_activities": ["Named extra if time allows"],
      "travel": { "from": "", "to": "", "estimated_distance": "", "estimated_duration": "" }
    }
  ]
}`
}

export { STYLE_INSTRUCTIONS }
