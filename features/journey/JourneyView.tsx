import { BRAND } from '@/config/brand'
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

export function JourneyView({ journey }: { journey: CanonicalJourney }) {
  const start = formatIso(journey.startDate)
  const end = formatIso(journey.endDate)

  return (
    <article className="journey-root">
      <header className="journey-hero">
        <img src={BRAND.logoSrc} alt="LankaLux" className="journey-logo" />
        <p className="journey-kicker">A journey prepared for</p>
        <h1 className="journey-client">{journey.clientName}</h1>
        <h2 className="journey-title">{journey.title}</h2>
        <p className="journey-meta">
          {[start && end ? `${start} — ${end}` : start || end, journey.durationLabel, partyLabel(journey)]
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
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              ) : null}
              {(day.travel.from || day.travel.to || day.travel.estimated_duration) && (
                <p className="journey-travel">
                  Travel{day.travel.from && day.travel.to ? ` ${day.travel.from} → ${day.travel.to}` : ''}
                  {day.travel.estimated_distance ? ` · ${day.travel.estimated_distance}` : ''}
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
            <a href="mailto:info@lankalux.com">info@lankalux.com</a>
          </p>
        </section>
      </footer>
    </article>
  )
}
