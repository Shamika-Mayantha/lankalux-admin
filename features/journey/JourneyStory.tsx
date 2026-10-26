import { ItineraryStory } from '@/components/itinerary/ItineraryStory'
import { JourneyView, stripDistanceText } from '@/features/journey/JourneyView'
import type { CanonicalJourney } from '@/types/domain'

/**
 * A published journey (/journey/<token>, the link the console copies and emails) as the
 * immersive scroll story. ?view=classic is the side-map story, ?view=list the earlier plain page.
 */
export function JourneyStory({ journey, view }: { journey: CanonicalJourney; view?: string }) {
  if (view === 'list') return <JourneyView journey={journey} showDistance={false} />

  return (
    <ItineraryStory
      clientName={journey.clientName}
      startDate={journey.startDate}
      endDate={journey.endDate}
      duration={journey.durationDays}
      itinerary={{
        title: journey.title,
        summary: stripDistanceText(journey.summary),
        days: journey.days.map((d) => ({
          day: d.day,
          title: d.title,
          location: d.location,
          image: d.recommended_images[0],
          activities: d.activities,
          optional_activities: d.optional_activities,
          what_to_expect: stripDistanceText(d.description),
        })),
      }}
      vehicle={journey.vehicle ? { name: journey.vehicle.name, description: journey.vehicle.description, images: journey.vehicle.photos } : null}
      price={journey.price || null}
      variant={view === 'classic' ? 'story' : 'journey'}
      extras={<JourneyExtras journey={journey} />}
    />
  )
}


/** Stays, what is included and the practical notes, in the story's style. */
function JourneyExtras({ journey }: { journey: CanonicalJourney }) {
  const blocks = [
    journey.hotels.length
      ? {
          title: 'Suggested stays',
          items: journey.hotels.map((h) => ({
            head: h.name,
            text: [h.destination, h.star_category, h.room_category, h.meal_plan].filter(Boolean).join(' · '),
          })),
        }
      : null,
    journey.includedServices.length ? { title: 'Included', items: journey.includedServices.map((s) => ({ head: '', text: s })) } : null,
    journey.importantInformation.length ? { title: 'Good to know', items: journey.importantInformation.map((s) => ({ head: '', text: s })) } : null,
  ].filter(Boolean) as { title: string; items: { head: string; text: string }[] }[]
  if (!blocks.length) return null
  return (
    <section style={{ background: 'var(--paper)', color: 'var(--ink)' }}>
      <div className="ls-wrap grid gap-12 lg:grid-cols-3" style={{ paddingBlock: 'clamp(4.5rem, 10vw, 8rem)' }}>
        {blocks.map((b) => (
          <div key={b.title}>
            <p data-reveal className="ls-display" style={{ fontSize: 'clamp(1.6rem, 2.6vw, 2.25rem)', lineHeight: 1.05 }}>
              {b.title}
            </p>
            <ul data-reveal-group style={{ marginTop: '1.5rem', display: 'grid', gap: '0.9rem', listStyle: 'none', padding: 0 }}>
              {b.items.map((it, i) => (
                <li key={i} style={{ display: 'flex', gap: '0.75rem', alignItems: 'baseline' }}>
                  <span className="ls-dot" aria-hidden="true" />
                  <span>
                    {it.head ? <strong style={{ fontWeight: 600 }}>{it.head}</strong> : null}
                    {it.head && it.text ? <br /> : null}
                    {it.text}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}
