/**
 * The three options are generated at the same time, so none of them can see the others. Without
 * a brief of its own each one drifts to the same classic loop with the same headline sights.
 * This gives every option its own character and checks the Exploration option in code, the one
 * that most often comes back as a copy of option 1.
 */

import type { ItineraryStyle } from '@/config/status'
import { dayLegs, km, placesIn, townFor, type RouteIssue } from '@/lib/route-order'

type Days = Parameters<typeof dayLegs>[0]

/** True when the client already set the bases night by night ("2 nights Colombo, 3 nights Sigiriya"). */
export function clientFixedRoute(text: string | null | undefined): boolean {
  const matches = (text || '').match(/\b(?:\d+|one|two|three|four|five)\s+nights?\s+(?:in\s+|at\s+)?[A-Z]/gi) || []
  return matches.length >= 2
}

/** Overnight towns of the classic loop. The Exploration option sleeps somewhere else at least once. */
const CLASSIC_BASES = ['Colombo Airport', 'Negombo', 'Colombo', 'Mount Lavinia', 'Sigiriya', 'Dambulla', 'Habarana', 'Kandy', 'Nuwara Eliya', 'Ella', 'Tissamaharama', 'Yala', 'Mirissa', 'Weligama', 'Unawatuna', 'Galle', 'Bentota']

/**
 * Places most visitors miss, each with the classic sight it can stand in for. Names match the
 * route gazetteer so the map check knows where they are.
 */
const OFFBEAT: { name: string; instead: string }[] = [
  { name: 'Pidurangala Rock', instead: 'a second Sigiriya climb, for the view of the Lion Rock itself' },
  { name: 'Ritigala forest monastery', instead: 'a third cave temple or ruin' },
  { name: 'Minneriya, Kaudulla or Hurulu Eco Park safari', instead: 'a second day of ruins' },
  { name: 'Anuradhapura or Mihintale', instead: 'Polonnaruwa' },
  { name: 'Knuckles Range walk', instead: 'a Kandy city afternoon' },
  { name: 'Embekke Devalaya', instead: 'the Kandy shops' },
  { name: 'Kitulgala rafting or rainforest walk', instead: 'a straight Kandy to hills drive' },
  { name: 'Horton Plains at first light', instead: 'a Nuwara Eliya town walk' },
  { name: "Haputale and Lipton's Seat", instead: 'a second Nuwara Eliya day' },
  { name: 'Diyaluma Falls swim', instead: 'Ravana Falls from the roadside' },
  { name: 'Belihuloya river stay', instead: 'the main Ella to coast road' },
  { name: 'Udawalawe elephant safari', instead: 'Yala, when leopards are not the priority' },
  { name: 'Bundala birding', instead: 'a second Yala drive' },
  { name: 'Mulkirigala rock temple', instead: 'another coastal temple' },
  { name: 'Hiriketiya or Tangalle', instead: 'Mirissa' },
  { name: 'Koggala lake by boat', instead: 'a second Galle Fort walk' },
  { name: 'Sinharaja rainforest', instead: 'a beach day, for walkers and birders' },
  { name: 'Wilpattu or Kalpitiya', instead: 'the airport night, on longer trips' },
]

/** Offbeat places the generated days actually use. */
function offbeatUsed(days: Days) {
  const lines = days.flatMap((d) => [...(d.activities || []), d.location || '', d.overnight_location || ''])
  const used = new Set<string>()
  for (const o of OFFBEAT) {
    const names = placesIn(o.name).map((p) => p.name)
    if (names.some((n) => lines.some((l) => placesIn(l).some((p) => p.name === n)))) used.add(o.name)
  }
  return used
}

/** Offbeat places within reach of this trip's bases, for the rewrite note. */
function offbeatNear(days: Days) {
  const bases = dayLegs(days).map((l) => l.to)
  return OFFBEAT.filter((o) => placesIn(o.name).some((p) => bases.some((b) => km(b, p) < 60))).map((o) => o.name)
}

export function optionBrief(style: ItineraryStyle, opts: { fixedRoute: boolean }): string {
  const route = opts.fixedRoute
    ? 'The client has already chosen the overnight towns and nights. Keep exactly those bases and nights in this option. The difference lies in how the days are filled.'
    : null

  if (style === 'balanced') {
    return `WHAT MAKES THIS OPTION DIFFERENT (the client sees two other options next to it)
This is the SIGNATURE option: the route most first-time guests love, with the headline sights done well and at the right moment of the day.
- ${route || 'Use the proven sweep that best fits the requested places and the season.'}
- Each day leads with the famous sight of that region (Sigiriya, the Temple of the Tooth, the hill-country train, a leopard safari, Galle Fort) plus the best supporting stops around it.`
  }
  if (style === 'relaxed') {
    return `WHAT MAKES THIS OPTION DIFFERENT (the client sees two other options next to it)
This is the SLOW option: the same island with half the hurry.
- ${route || 'Fewer overnight bases than a classic tour: leave out one region the client did not ask for and give the time to longer stays. Two or three nights in each base.'}
- One headline per day, never two big climbs or two long drives back to back. Every base gets one unhurried day: a tea estate lunch, a garden, a spa treatment, a beach afternoon, a boat on a lake.
- Pick the gentle version of a sight where there is one (Sigiriya seen from the gardens and the museum or at sunset, a short train section instead of the full ride, a sunset jeep drive instead of a dawn one).
- Prefer late starts in the wording ("after a slow breakfast") without clock times.`
  }
  return `WHAT MAKES THIS OPTION DIFFERENT (the client sees two other options next to it)
This is the EXPLORATION option, the off the beaten track version. It must not read like the classic tour with extra stops.
- ${route || 'Sleep at least one night somewhere a classic tour does not stay, for example Kitulgala, Knuckles, Haputale, Belihuloya, Udawalawe, Tangalle, Hiriketiya, Sinharaja, Wilpattu or Kalpitiya (only where it fits the season and the sweep).'}
- Keep the places the client asked for, but around them use lesser-known places most visitors miss. Use at least 4 of these where they lie near the route:
${OFFBEAT.map((o) => `  - ${o.name} (instead of ${o.instead})`).join('\n')}
- Add one local encounter on most days: a village cooking lesson, a tea plucker's walk, a fishing harbour at dawn, a temple puja, a cycle along paddy fields.`
}

/** Notes that send the Exploration option back for a rewrite when it reads like the classic tour. */
export function checkCharacter(style: ItineraryStyle, days: Days, opts: { fixedRoute: boolean }): RouteIssue[] {
  if (style !== 'experience' || days.length < 4) return []
  const issues: RouteIssue[] = []
  const used = offbeatUsed(days)
  const need = Math.min(4, Math.ceil(days.length / 2))
  if (used.size < need) {
    const near = offbeatNear(days).filter((n) => !used.has(n))
    issues.push({
      day: null,
      kind: 'samey',
      message: `This is the Exploration option but it reads like the classic tour: only ${used.size} lesser-known place${used.size === 1 ? '' : 's'} used. Swap some headline stops for places near this route such as ${near.slice(0, 6).join(', ') || 'Ritigala, Knuckles, Udawalawe or Hiriketiya'}.`,
    })
  }
  if (!opts.fixedRoute && days.length >= 6) {
    const classic = CLASSIC_BASES.map((n) => townFor(n)).filter((p): p is NonNullable<typeof p> => !!p)
    const offLoop = dayLegs(days).some((l) => !classic.some((c) => km(c, l.to) < 12))
    if (!offLoop) {
      issues.push({
        day: null,
        kind: 'samey',
        message: 'Every night is in a classic tour town. Move at least one base somewhere quieter that fits the sweep, such as Kitulgala, Haputale, Belihuloya, Udawalawe, Tangalle or Hiriketiya.',
      })
    }
  }
  return issues
}
