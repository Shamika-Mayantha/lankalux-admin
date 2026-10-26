'use client'

import { useRef, useState } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useGSAP } from '@gsap/react'
import { MAP_OUTLINE, MAP_VIEWBOX } from '@/lib/itinerary-places'
import type { RenderDay } from './ItineraryRender'
import { dayHeading, fmt, localDate, StoryPhoto, type StoryRoute } from './story-shared'

const [, , MAP_W, MAP_H] = MAP_VIEWBOX.split(' ').map(Number)
/** How much closer than the whole island the camera sits over a stop (less on tall phone screens). */
const zoomFor = (aspect: number) => (aspect < 0.8 ? 1.9 : 2.6)

/**
 * The immersive day by day: the island fills the screen and the camera flies along the road to
 * each stop, drawing it in gold. On arrival the day's photograph takes over the whole screen and
 * the day's story scrolls up over it; then the photo gives way to the map for the next leg.
 * Everything is scrubbed by the scroll, so it plays backwards as well.
 */
export function JourneyDays({ days, route, startDate }: { days: RenderDay[]; route: StoryRoute; startDate?: string | null }) {
  const root = useRef<HTMLElement>(null)
  const [active, setActive] = useState(-1)

  useGSAP(
    () => {
      const el = root.current!
      const svg = el.querySelector<SVGSVGElement>('.lj-map')!
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

      // Camera frames, as SVG viewBoxes sized to the screen's shape.
      const frame = (cx: number, cy: number, zoom: number) => {
        const stage = el.querySelector<HTMLElement>('.lj-stage')!
        const aspect = stage.clientWidth / Math.max(1, stage.clientHeight)
        const h = MAP_H / zoom
        const w = h * aspect
        return `${(cx - w / 2).toFixed(1)} ${(cy - h / 2).toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}`
      }
      const stageAspect = () => {
        const stage = el.querySelector<HTMLElement>('.lj-stage')!
        return stage.clientWidth / Math.max(1, stage.clientHeight)
      }
      // The whole island, fitted to the screen whichever side is tighter.
      const overview = () => {
        const aspect = stageAspect()
        const h = Math.max(MAP_H, (MAP_W * 0.9) / aspect) / 0.94
        const w = h * aspect
        return `${((MAP_W - w) / 2).toFixed(1)} ${((MAP_H - h) / 2).toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}`
      }
      const at = (i: number) => {
        const s = route.stays[i]
        return s ? frame(s.at[0], s.at[1], zoomFor(stageAspect())) : overview()
      }
      gsap.set(svg, { attr: { viewBox: overview() } })

      days.forEach((_, i) => {
        const leg = el.querySelector(`[data-leg="${i}"]`)
        const scene = el.querySelector(`[data-scene="${i}"]`)
        const photo = el.querySelector(`[data-photo="${i}"]`)
        if (!leg || !scene) return

        // The flight: pull back a little mid-way, then settle over the next stop.
        const prev = route.stays[i - 1]
        const next = route.stays[i]
        const from = () => (i === 0 ? overview() : at(i - 1))
        const tl = gsap.timeline({ scrollTrigger: { trigger: leg, start: 'top 75%', end: 'bottom 45%', scrub: 0.8, invalidateOnRefresh: true } })
        if (prev && next && prev.name !== next.name) {
          const mid = () => frame((prev.at[0] + next.at[0]) / 2, (prev.at[1] + next.at[1]) / 2, zoomFor(stageAspect()) * 0.7)
          tl.fromTo(svg, { attr: { viewBox: from } }, { attr: { viewBox: mid }, ease: 'sine.out', duration: 0.5, immediateRender: false }, 0)
          tl.to(svg, { attr: { viewBox: () => at(i) }, ease: 'sine.inOut', duration: 0.5 }, 0.5)
        } else {
          tl.fromTo(svg, { attr: { viewBox: from } }, { attr: { viewBox: () => at(i) }, ease: 'power1.inOut', duration: 1, immediateRender: false }, 0)
        }
        const seg = el.querySelectorAll(`[data-seg="${i}"]`)
        if (seg.length) tl.fromTo(seg, { strokeDashoffset: 1 }, { strokeDashoffset: 0, ease: 'none', duration: 0.9, immediateRender: false }, 0.05)
        tl.fromTo(el.querySelector(`[data-leg-caption="${i}"]`), { autoAlpha: 0, y: 30 }, { autoAlpha: 1, y: 0, duration: 0.35, immediateRender: false }, 0.55)

        const out = el.querySelector(`[data-leg-out="${i}"]`)
        if (out) gsap.to(out, { autoAlpha: 0, ease: 'none', scrollTrigger: { trigger: out, start: 'top 30%', end: 'top 8%', scrub: true } })

        // Arrival: the day's photo takes the screen while its story is read, then lets the map back.
        if (photo) {
          const img = photo.querySelector('img')
          gsap.fromTo(photo, { autoAlpha: 0 }, { autoAlpha: 1, ease: 'none', immediateRender: false, scrollTrigger: { trigger: scene, start: 'top 95%', end: 'top 40%', scrub: true } })
          gsap.fromTo(photo, { autoAlpha: 1 }, { autoAlpha: 0, ease: 'none', immediateRender: false, scrollTrigger: { trigger: scene, start: 'bottom bottom', end: 'bottom 75%', scrub: true } })
          if (img) gsap.fromTo(img, { scale: 1.14 }, { scale: 1, ease: 'none', scrollTrigger: { trigger: scene, start: 'top bottom', end: 'bottom top', scrub: true } })
        }

        ScrollTrigger.create({ trigger: leg, endTrigger: scene, start: 'top 60%', end: 'bottom 60%', onToggle: (st) => st.isActive && setActive(i) })
      })

      // Journey's end: back out over the whole island with the full route drawn.
      const finale = el.querySelector('[data-finale]')
      if (finale) {
        const last = days.length - 1
        gsap.fromTo(svg, { attr: { viewBox: () => at(last) } }, { attr: { viewBox: overview }, ease: 'power1.inOut', immediateRender: false, scrollTrigger: { trigger: finale, start: 'top 85%', end: 'bottom bottom', scrub: 0.8, invalidateOnRefresh: true } })
        ScrollTrigger.create({ trigger: finale, start: 'top 60%', end: 'bottom top', onToggle: (st) => st.isActive && setActive(days.length) })
      }
    },
    { scope: root, dependencies: [days.length] },
  )

  const done = active >= days.length
  const activeStay = active >= 0 && active < days.length ? route.stays[active] : null
  // Stops already reached are shown in gold; the rest wait in ivory.
  const reached = new Set(route.stays.slice(0, done ? days.length : active + 1).map((s) => s?.name))
  // Towns too close to an earlier one (Negombo and the airport) are not labelled in the wide view.
  const labelled = new Set<string>()
  route.stops.forEach((p, i) => {
    const near = route.stops.slice(0, i).some((q) => labelled.has(q.name) && Math.hypot(q.at[0] - p.at[0], q.at[1] - p.at[1]) < 14)
    if (!near) labelled.add(p.name)
  })

  return (
    <section ref={root} className="lj">
      <div className="lj-stage" aria-hidden="true">
        <svg className="lj-map" viewBox={MAP_VIEWBOX} preserveAspectRatio="xMidYMid meet" fill="none">
          <path d={MAP_OUTLINE} fill="#14301f" stroke="var(--ivory)" strokeOpacity={0.45} strokeWidth={1.1} vectorEffect="non-scaling-stroke" />
          {route.paths.map((d, i) =>
            d ? <path key={'ghost' + i} d={d} stroke="var(--ivory)" strokeOpacity={0.25} strokeWidth={1.3} strokeDasharray="3 6" vectorEffect="non-scaling-stroke" /> : null,
          )}
          {route.paths.map((d, i) =>
            d ? (
              // Drawn in map units (not non-scaling) so the pathLength-based dash reveal stays exact while zooming.
              <path key={i} data-seg={i} d={d} stroke="var(--gold)" strokeWidth={1} strokeLinecap="round" pathLength={1} strokeDasharray="1" strokeDashoffset={1} />
            ) : null,
          )}
          {route.stops.map((p) => {
            const [x, y] = p.at
            const on = p.name === activeStay?.name
            const seen = reached.has(p.name)
            const left = x > MAP_W * 0.62
            return (
              <g key={p.name}>
                {on && <circle className="lj-pulse" cx={x} cy={y} r={7} fill="var(--gold)" fillOpacity={0.3} />}
                <circle cx={x} cy={y} r={on ? 3.2 : 2.2} fill={seen ? 'var(--gold)' : 'var(--ivory)'} fillOpacity={seen ? 1 : 0.6} style={{ transition: 'r 0.4s, fill 0.4s' }} />
                {(on || ((seen || done) && labelled.has(p.name))) && <text
                  x={left ? x - 6 : x + 6}
                  y={y + 3}
                  textAnchor={left ? 'end' : 'start'}
                  fill="var(--ivory)"
                  fillOpacity={on || done ? 1 : 0.7}
                  fontSize={on ? 9 : 6.5}
                  fontFamily="var(--display)"
                  style={{ transition: 'font-size 0.4s, fill-opacity 0.4s' }}
                >
                  {p.name}
                </text>}
              </g>
            )
          })}
        </svg>

        {days.map((day, i) =>
          day.image ? (
            <div key={i} data-photo={i} className="lj-photo">
              <StoryPhoto src={day.image} alt="" sizes="100vw" />
            </div>
          ) : null,
        )}
        <div className="lj-shade" />

        <p className="lj-hud">
          {done ? (
            <>
              <span>{days.length} days</span> · {route.stops.length} stops
            </>
          ) : active >= 0 ? (
            <>
              <span>Day {dayHeading(days[active]).day}</span> of {days.length}
              {activeStay ? ` · ${activeStay.name}` : ''}
            </>
          ) : (
            <span>Your route</span>
          )}
        </p>
      </div>

      <div className="lj-flow">
        <div className="lj-intro">
          <p data-reveal className="lj-kicker">Your route</p>
          <p data-split className="ls-display lj-intro-title">
            {days.length} days across the island
          </p>
        </div>

        {days.map((day, i) => {
          const h = dayHeading(day)
          const date = fmt(localDate(startDate, h.day - 1), { weekday: 'long', day: 'numeric', month: 'long' })
          const stay = route.stays[i]
          const moved = i === 0 || (stay && route.stays[i - 1]?.name !== stay.name)
          return (
            <div key={`${day.day}-${i}`} className="lj-day">
              <div data-leg={i} className="lj-leg">
                <div data-leg-out={i}>
                  <div data-leg-caption={i} className="lj-leg-caption">
                    <p className="ls-display lj-leg-day">Day {h.day}</p>
                    <p className="lj-leg-place">{stay ? (moved ? (i === 0 ? stay.name : `On to ${stay.name}`) : `Another day in ${stay.name}`) : day.location}</p>
                  </div>
                </div>
              </div>

              <article data-scene={i} className="lj-scene">
                {day.image ? (
                  <div className="ls-frame lj-print-photo">
                    <div className="ls-frame-inner">
                      <StoryPhoto src={day.image} alt={day.title || day.location} sizes="100vw" />
                    </div>
                  </div>
                ) : null}
                <div className="lj-card">
                  <p data-reveal className="lj-card-date">
                    Day {h.day}
                    {date ? <span> · {date}</span> : null}
                  </p>
                  <h2 data-split className="lj-card-title">
                    {h.title}
                  </h2>
                  {day.location ? (
                    <p data-reveal className="lj-card-place">
                      {day.location}
                    </p>
                  ) : null}
                  {day.what_to_expect ? (
                    <p data-reveal className="lj-card-text">
                      {day.what_to_expect}
                    </p>
                  ) : null}
                  {day.activities && day.activities.length > 0 ? (
                    <>
                      <p data-reveal className="ls-display lj-card-sub">The day</p>
                      <ul data-reveal-group className="lj-card-list">
                        {day.activities.map((a, j) => (
                          <li key={j}>
                            <span className="ls-dot" aria-hidden="true" />
                            <span>{a}</span>
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : null}
                </div>
              </article>
            </div>
          )
        })}

        <div data-finale className="lj-finale">
          <p data-reveal className="lj-kicker">{route.stops.length} stops, one journey</p>
          <p data-split className="ls-display lj-intro-title">
            Your journey across Sri Lanka
          </p>
        </div>
      </div>
    </section>
  )
}
