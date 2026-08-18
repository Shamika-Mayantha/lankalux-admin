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

function stripDistanceText(text: string) {
  return text
    .replace(/\b\d+(?:\.\d+)?\s*(?:km|kms|kilomet(?:er|re)s?)\b/gi, '')
    .replace(/\b(?:distance|total distance)\s*[:\-]?\s*\d+(?:\.\d+)?\s*(?:km|kms|kilomet(?:er|re)s?)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .trim()
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
  const summaryText = showDistance ? journey.summary : stripDistanceText(journey.summary)

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
        {summaryText ? <p className="journey-summary">{summaryText}</p> : null}
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
              {day.description ? (
                <p className="journey-desc">{showDistance ? day.description : stripDistanceText(day.description)}</p>
              ) : null}
              {day.activities.length ? (
                <>
                  <h4 className="journey-list-title">Highlights</h4>
                  <ul className="journey-acts">
                  {day.activities.map((a) => (
                    <li key={a}>{showDistance ? formatActivityTime(a) : stripDistanceText(formatActivityTime(a))}</li>
                  ))}
                  </ul>
                </>
              ) : null}
              {day.optional_activities.length ? (
                <>
                  <h4 className="journey-list-title">Optional experiences</h4>
                  <ul className="journey-acts journey-optional">
                    {day.optional_activities.map((a) => (
                      <li key={a}>{showDistance ? formatActivityTime(a) : stripDistanceText(formatActivityTime(a))}</li>
                    ))}
                  </ul>
                </>
              ) : null}
              {(day.travel.from || day.travel.to || day.travel.estimated_duration) && (
                (() => {
                  const distanceSafeDuration = showDistance
                    ? day.travel.estimated_duration
                    : stripDistanceText(day.travel.estimated_duration)
                  const hasTravelText = day.travel.from || day.travel.to || distanceSafeDuration
                  if (!hasTravelText) return null
                  return (
                    <p className="journey-travel">
                      Travel{day.travel.from && day.travel.to ? ` ${day.travel.from} → ${day.travel.to}` : ''}
                      {showDistance && day.travel.estimated_distance ? ` · ${day.travel.estimated_distance}` : ''}
                      {distanceSafeDuration ? ` · ${distanceSafeDuration}` : ''}
                    </p>
                  )
                })()
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
