import { BRAND } from '@/config/brand'
import { formatKilometers, totalKilometersFor } from '@/services/kilometers.service'
import type { CanonicalJourney } from '@/types/domain'
import './journey.css'

function partyLabel(j: CanonicalJourney) {
  const parts = [`${j.party.adults} adult${j.party.adults === 1 ? '' : 's'}`]
  if (j.party.children) {
    const ages = j.party.childrenAges.length ? ` (ages ${j.party.childrenAges.join(', ')})` : ''
    parts.push(`${j.party.children} child${j.party.children === 1 ? '' : 'ren'}${ages}`)
  }
  return parts.join(' · ')
}

function formatIso(iso: string | null) {
  if (!iso) return null
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

const LOCATION_INSIGHTS: Record<string, string> = {
  colombo:
    "Sri Lanka's coastal capital blends colonial architecture, vibrant local markets, modern cafes, and oceanfront city life.",
  sigiriya:
    "Sigiriya is famous for the ancient Lion Rock fortress, dramatic views, historic frescoes, and surrounding cultural villages.",
  kandy:
    "Kandy is the cultural heart of the island, known for the Temple of the Tooth, lakefront walks, and traditional arts.",
  ella:
    "Ella offers cool hill-country air, tea landscapes, scenic train routes, waterfalls, and panoramic mountain viewpoints.",
  yala:
    "Yala is one of Sri Lanka's top wildlife regions, where safari drives often reveal leopards, elephants, and birdlife.",
  galle:
    "Galle charms with its UNESCO-listed fort, cobbled lanes, boutique shops, and sunset views over the southern coast.",
  nuwaraeliya:
    "Nuwara Eliya is known for misty tea estates, colonial-era charm, cool weather, and beautiful highland scenery.",
  bentota:
    "Bentota is a relaxed beach destination ideal for lagoon experiences, coastal sunsets, and luxury seaside downtime.",
  mirissa:
    "Mirissa combines palm-lined beaches, whale-watching opportunities, and a laid-back southern coast atmosphere.",
}

function toTwelveHour(hour: number, minute: number) {
  const suffix = hour >= 12 ? 'PM' : 'AM'
  const hour12 = hour % 12 === 0 ? 12 : hour % 12
  return `${hour12}:${String(minute).padStart(2, '0')} ${suffix}`
}

function formatActivityTime(line: string) {
  const match = line.match(/^(\d{1,2}):(\d{2})(?:\s*([aApP][mM]))?\s*[-–]\s*(.+)$/)
  if (!match) return line
  const rawHour = Number(match[1])
  const minute = Number(match[2])
  const ampm = match[3]?.toUpperCase()
  const rest = match[4]?.trim() || ''
  if (!Number.isFinite(rawHour) || !Number.isFinite(minute) || minute < 0 || minute > 59) return line
  if (rawHour < 0 || rawHour > 23) return line
  let hour24 = rawHour
  if (ampm === 'AM' || ampm === 'PM') {
    if (hour24 === 12) {
      hour24 = ampm === 'AM' ? 0 : 12
    } else if (ampm === 'PM') {
      hour24 += 12
    }
  }
  return `${toTwelveHour(hour24, minute)} - ${rest}`
}

function normalizeLocationKey(location: string) {
  return location.toLowerCase().replace(/[^a-z]/g, '')
}

function getLocationInsight(location: string) {
  const key = normalizeLocationKey(location)
  if (LOCATION_INSIGHTS[key]) return LOCATION_INSIGHTS[key]
  return `${location} offers meaningful local culture, authentic food, scenic highlights, and memorable experiences tailored to your journey.`
}

export function JourneyView({
  journey,
  showDistance = true,
}: {
  journey: CanonicalJourney
  showDistance?: boolean
}) {
  const start = formatIso(journey.startDate)
  const end = formatIso(journey.endDate)
  const kilometers = journey.totalKilometers || totalKilometersFor(journey.days)
  const uniqueLocations = Array.from(
    new Map(
      journey.days
        .map((d) => d.location?.trim())
        .filter((location): location is string => !!location)
        .map((location) => [normalizeLocationKey(location), location])
    ).values()
  )

  return (
    <article className="journey-root">
      <header className="journey-hero">
        <img src={BRAND.logoSrc} alt="LankaLux" className="journey-logo" />
        <p className="journey-kicker">A journey prepared for</p>
        <h1 className="journey-client">{journey.clientName}</h1>
        <h2 className="journey-title">{journey.title}</h2>
        <p className="journey-meta">
          {[
            start && end ? `${start} — ${end}` : start || end,
            journey.durationLabel,
            showDistance ? formatKilometers(kilometers) : null,
            partyLabel(journey),
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
        {journey.summary ? <p className="journey-summary">{journey.summary}</p> : null}
        {journey.price ? <p className="journey-price">{journey.price}</p> : null}
      </header>

      <div className="journey-days">
        {journey.days.map((day) => {
          const img = day.recommended_images[0]
          return (
            <section key={day.day} className="journey-day">
              <p className="journey-day-num">Day {String(day.day).padStart(2, '0')}</p>
              <h3 className="journey-day-title">{day.title}</h3>
              <p className="journey-day-loc">
                {day.location}
                {day.overnight_location && day.overnight_location !== day.location
                  ? ` · Overnight ${day.overnight_location}`
                  : ''}
                {day.date ? ` · ${day.date}` : ''}
              </p>
              {img ? (
                <div className="journey-photo-wrap">
                  <img src={img} alt={day.location || day.title} className="journey-photo" />
                </div>
              ) : null}
              {day.description ? <p className="journey-desc">{day.description}</p> : null}
              {day.activities.length ? (
                <ul className="journey-acts">
                  {day.activities.map((a) => (
                    <li key={a}>{formatActivityTime(a)}</li>
                  ))}
                </ul>
              ) : null}
              {(day.travel.from || day.travel.to || day.travel.estimated_duration) && (
                <p className="journey-travel">
                  Travel{day.travel.from && day.travel.to ? ` ${day.travel.from} → ${day.travel.to}` : ''}
                  {showDistance && day.travel.estimated_distance ? ` · ${day.travel.estimated_distance}` : ''}
                  {day.travel.estimated_duration ? ` · ${day.travel.estimated_duration}` : ''}
                </p>
              )}
            </section>
          )
        })}
      </div>

      <footer className="journey-footer">
        {journey.vehicle ? (
          <section>
            <h3>Your vehicle</h3>
            <p className="journey-v-name">{journey.vehicle.name}</p>
            <p>{journey.vehicle.description}</p>
            <div className="journey-v-photos">
              {journey.vehicle.photos.slice(0, 3).map((src) => (
                <img key={src} src={src} alt={journey.vehicle?.name} />
              ))}
            </div>
          </section>
        ) : null}

        {journey.hotels.length ? (
          <section>
            <h3>Suggested stays</h3>
            {journey.hotels.map((h) => (
              <div key={h.id} className="journey-hotel">
                <p className="journey-v-name">{h.name}</p>
                <p>
                  {[h.destination, h.star_category, h.room_category, h.meal_plan].filter(Boolean).join(' · ')}
                </p>
                {h.description ? <p>{h.description}</p> : null}
              </div>
            ))}
          </section>
        ) : null}

        {uniqueLocations.length > 0 ? (
          <section>
            <h3>Destination insights</h3>
            <div className="journey-insights">
              {uniqueLocations.map((location) => (
                <article key={location} className="journey-insight-card">
                  <p className="journey-insight-title">{location}</p>
                  <p>{getLocationInsight(location)}</p>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        <section>
          <h3>Included</h3>
          <ul>
            {journey.includedServices.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </section>
        <section>
          <h3>Good to know</h3>
          <ul>
            {journey.importantInformation.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </section>
        <section className="journey-contact">
          <p className="journey-brand">LankaLux</p>
          <p>{BRAND.tagline}</p>
          <p>
            <a href="mailto:hello@lankalux.com">hello@lankalux.com</a>
          </p>
        </section>
      </footer>
    </article>
  )
}
