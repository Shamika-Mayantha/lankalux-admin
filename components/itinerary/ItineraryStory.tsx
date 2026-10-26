'use client'

import Lenis from 'lenis'
import { useMemo, useRef, useState, type ReactNode } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { SplitText } from 'gsap/SplitText'
import { CustomEase } from 'gsap/CustomEase'
import { useGSAP } from '@gsap/react'
import { BRAND } from '@/config/brand'
import { coverFor, MAP_OUTLINE, MAP_VIEWBOX } from '@/lib/itinerary-places'
import { elegantTitle, type RenderItinerary, type RenderVehicle } from './ItineraryRender'
import { JourneyDays } from './JourneyDays'
import { buildRoute, dayHeading, fmt, localDate, StoryPhoto } from './story-shared'
import './itinerary-story.css'

gsap.registerPlugin(ScrollTrigger, SplitText, CustomEase, useGSAP)
// The lankalux.com curves: a long, heavy settle.
CustomEase.create('lux', '0.16, 1, 0.3, 1')
CustomEase.create('luxInOut', '0.7, 0, 0.2, 1')

/**
 * The client-facing itinerary as a scroll story, in the lankalux.com style: the opening photo
 * drifts away under the title, then the journey is told day by day while the island map beside it
 * draws each stretch of road. The content is exactly what the generator wrote; only the
 * presentation differs from ItineraryRender, which stays the editor and in-admin preview.
 */
export function ItineraryStory({
  clientName,
  startDate,
  endDate,
  duration,
  itinerary,
  vehicle,
  price,
  variant = 'story',
  extras,
}: {
  clientName: string
  startDate?: string | null
  endDate?: string | null
  duration?: number | null
  itinerary: RenderItinerary
  vehicle?: RenderVehicle
  price?: string | null
  /** 'journey' is the immersive version: a full-screen map that flies to each stop. */
  variant?: 'story' | 'journey'
  /** Extra sections (stays, what is included) shown after the vehicle, before the sign-off. */
  extras?: ReactNode
}) {
  const root = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(0)
  const days = useMemo(() => itinerary.days || [], [itinerary.days])
  const route = useMemo(() => buildRoute(days), [days])
  // A full-resolution LankaLux photograph of the first destination opens the journey.
  const heroSrc = coverFor(route.stays.find(Boolean))
  // The nights, grouped by place, for the printed overview: "Days 1 to 3, Sigiriya".
  const nights = useMemo(() => {
    const out: { from: number; to: number; name: string }[] = []
    days.forEach((d, i) => {
      const name = route.stays[i]?.name || d.location || ''
      const n = dayHeading(d).day
      const last = out[out.length - 1]
      if (last && last.name === name) last.to = n
      else if (name) out.push({ from: n, to: n, name })
    })
    return out
  }, [days, route])
  const hasMap = route.stops.length >= 2
  const journey = variant === 'journey' && hasMap
  const activeStay = route.stays[active]

  const start = localDate(startDate)
  const end = localDate(endDate)
  const facts = [
    start ? { label: 'Arriving', value: fmt(start, { day: 'numeric', month: 'long' }) } : null,
    end ? { label: 'Departing', value: fmt(end, { day: 'numeric', month: 'long' }) } : null,
    duration ? { label: 'Length', value: `${duration} days` } : null,
  ].filter(Boolean) as { label: string; value: string }[]

  useGSAP(
    () => {
      const el = root.current!
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches

      // Which day is current: the one crossing the middle of the screen.
      gsap.utils.toArray<HTMLElement>('[data-day]', el).forEach((block, i) => {
        ScrollTrigger.create({ trigger: block, start: 'top 55%', end: 'bottom 55%', onToggle: (st) => st.isActive && setActive(i) })
      })

      if (reduce) {
        gsap.set('[data-day-path]', { strokeDashoffset: 0 })
        return
      }

      // Smooth wheel scrolling as on the website (touch scrolling stays native on phones).
      const lenis = new Lenis({ lerp: 0.1, smoothWheel: true, wheelMultiplier: 0.9 })
      lenis.on('scroll', ScrollTrigger.update)
      const tick = (time: number) => lenis.raf(time * 1000)
      gsap.ticker.add(tick)
      gsap.ticker.lagSmoothing(0)

      gsap.defaults({ ease: 'lux', duration: 1 })
      const page = { trigger: el, start: 'top top', end: 'bottom bottom', scrub: 0.3 }
      gsap.to('.ls-progress', { scaleX: 1, ease: 'none', scrollTrigger: page })

      // Opening: the photo settles in, then drifts and the title lifts away as the story starts.
      const hero = { trigger: '.ls-hero', start: 'top top', end: 'bottom top', scrub: true }
      gsap.from('.ls-hero-photo', { scale: 1.16, duration: 2.6 })
      gsap.to('.ls-hero-photo img', { yPercent: 14, ease: 'none', scrollTrigger: hero })
      gsap.to('.ls-hero-copy', { yPercent: -14, autoAlpha: 0, ease: 'none', scrollTrigger: { ...hero, end: '70% top' } })

      const immediate = (n: Element) => n.hasAttribute('data-immediate')
      const at = (n: Element, startAt = 'top 86%') => (immediate(n) ? undefined : { trigger: n, start: startAt, once: true })
      const delayOf = (n: Element) => Number((n as HTMLElement).dataset.delay || 0) + (immediate(n) ? 0.2 : 0)

      gsap.utils.toArray<HTMLElement>('[data-split]', el).forEach((n) => {
        SplitText.create(n, {
          type: 'lines',
          mask: 'lines',
          linesClass: 'split-line',
          autoSplit: true,
          aria: 'none',
          onSplit: (self) =>
            gsap.from(self.lines, { yPercent: 115, duration: 1.25, stagger: 0.09, delay: delayOf(n), scrollTrigger: at(n, 'top 90%') }),
        })
      })
      gsap.utils.toArray<HTMLElement>('[data-reveal]', el).forEach((n) => {
        gsap.from(n, { autoAlpha: 0, y: 28, duration: 1.1, delay: delayOf(n), scrollTrigger: at(n), clearProps: 'transform' })
      })
      gsap.utils.toArray<HTMLElement>('[data-reveal-group]', el).forEach((g) => {
        gsap.from(g.children, { autoAlpha: 0, y: 24, duration: 1, stagger: 0.07, delay: delayOf(g), scrollTrigger: at(g, 'top 84%'), clearProps: 'transform' })
      })
      gsap.utils.toArray<HTMLElement>('[data-clip]', el).forEach((frame) => {
        const inner = frame.querySelector('.ls-frame-inner')
        const tl = gsap.timeline({ scrollTrigger: at(frame, 'top 88%') })
        tl.fromTo(frame, { clipPath: 'inset(100% 0% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.5, ease: 'luxInOut', onComplete: () => void gsap.set(frame, { clipPath: 'none' }) })
        if (inner) {
          tl.from(inner, { scale: 1.18, duration: 1.9 }, 0)
          // While on screen the photo drifts against the scroll.
          gsap.fromTo(inner, { yPercent: -6 }, { yPercent: 6, ease: 'none', scrollTrigger: { trigger: frame, start: 'top bottom', end: 'bottom top', scrub: true } })
        }
      })

      // Each day draws its stretch of road as it scrolls in.
      gsap.utils.toArray<HTMLElement>('[data-day]', el).forEach((block, i) => {
        const segs = el.querySelectorAll(`[data-day-path="${i}"]`)
        if (segs.length)
          gsap.fromTo(segs, { strokeDashoffset: 1 }, { strokeDashoffset: 0, ease: 'none', scrollTrigger: { trigger: block, start: 'top 80%', end: 'top 30%', scrub: 0.5 } })
      })

      // Fonts and lazy photos change heights; re-measure once they settle.
      document.fonts?.ready.then(() => ScrollTrigger.refresh())
      const onLoad = () => ScrollTrigger.refresh()
      window.addEventListener('load', onLoad)

      return () => {
        window.removeEventListener('load', onLoad)
        gsap.ticker.remove(tick)
        lenis.destroy()
      }
    },
    { scope: root, dependencies: [days.length] },
  )

  const map = (labels: boolean, className: string) => (
    <svg viewBox={MAP_VIEWBOX} className={className} fill="none" aria-hidden="true">
      <path d={MAP_OUTLINE} fill="var(--ivory)" fillOpacity={0.06} stroke="var(--ivory)" strokeOpacity={0.5} strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
      {/* The whole route, faint, so the shape of the journey is visible from the start. */}
      {route.returnPath ? <path d={route.returnPath} stroke="var(--ivory)" strokeOpacity={0.22} strokeWidth={1.4} strokeDasharray="3 5" vectorEffect="non-scaling-stroke" /> : null}
      {route.paths.map((d, i) =>
        d ? <path key={'ghost' + i} d={d} stroke="var(--ivory)" strokeOpacity={0.22} strokeWidth={1.4} strokeDasharray="3 5" vectorEffect="non-scaling-stroke" /> : null,
      )}
      {route.paths.map((d, i) =>
        d ? (
          <path key={i} data-day-path={i} d={d} stroke="var(--gold)" strokeWidth={2.6} strokeLinecap="round" pathLength={1} strokeDasharray="1" strokeDashoffset={1} vectorEffect="non-scaling-stroke" />
        ) : null,
      )}
      {route.stops.map((p) => {
        const [x, y] = p.at
        const on = p.name === activeStay?.name
        return (
          <g key={p.name} style={{ transition: 'opacity 0.5s' }} opacity={on ? 1 : 0.55}>
            {on && <circle cx={x} cy={y} r={14} fill="var(--gold)" fillOpacity={0.25} />}
            <circle cx={x} cy={y} r={on ? 6.5 : 4.5} fill={on ? 'var(--gold)' : 'var(--ivory)'} />
            {labels && on && (
              <text x={x > 260 ? x - 14 : x + 14} y={y + 7} textAnchor={x > 260 ? 'end' : 'start'} fill="var(--ivory)" fontSize={22} fontFamily="var(--sans)" fontWeight={500}>
                {p.name}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )

  const current = days[active]

  return (
    <div ref={root} className="lux-story">
      <div className="ls-progress" aria-hidden="true" />

      {/* Opening */}
      <section className="ls-hero">
        {heroSrc ? (
          <div className="ls-hero-photo">
            <StoryPhoto src={heroSrc} alt="" sizes="100vw" priority />
          </div>
        ) : null}
        <div className="ls-scrim" />

        <div className="ls-wrap ls-hero-brand" style={{ position: 'relative', paddingTop: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="ls-hero-mark" src="/brand/lankalux-mark-hd.png" alt="" width={44} height={44} />
          <span className="ls-display ls-hero-word">LankaLux</span>
        </div>
        {/* Paper only: the cover's centred crest. */}
        <div className="ls-cover-crest" aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/lankalux-mark-hd.png" alt="" width={120} height={120} />
          <p className="ls-display">LankaLux</p>
          <p>Private journeys, exceptional care</p>
        </div>

        <div className="ls-hero-copy ls-wrap" style={{ position: 'relative', paddingBottom: 'clamp(2.5rem, 8vh, 5.5rem)', paddingTop: '6rem' }}>
          <p data-reveal data-immediate style={{ color: 'var(--gold-bright)', fontSize: '0.95rem', letterSpacing: '0.04em' }}>
            Prepared for {clientName}
          </p>
          <h1 data-split data-immediate data-delay="0.1" style={{ marginTop: '0.75rem', maxWidth: '16ch', fontSize: 'clamp(2.75rem, 7.2vw, 7.5rem)', lineHeight: 0.98 }}>
            {elegantTitle(itinerary.title)}
          </h1>
          {facts.length ? (
            <dl data-reveal-group data-immediate data-delay="0.5" style={{ marginTop: '2.25rem', display: 'flex', flexWrap: 'wrap', gap: '1rem 2.75rem' }}>
              {facts.map((f) => (
                <div key={f.label}>
                  <dt style={{ fontSize: '0.875rem', color: 'rgb(244 239 228 / 0.7)' }}>{f.label}</dt>
                  <dd className="ls-display" style={{ fontSize: 'clamp(1.4rem, 2vw, 1.85rem)', lineHeight: 1.2 }}>{f.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          <div className="ls-cue" data-reveal data-immediate data-delay="0.8" style={{ marginTop: '2.5rem', display: 'flex', alignItems: 'center', gap: '0.9rem', fontSize: '0.875rem', color: 'rgb(244 239 228 / 0.75)' }}>
            <span className="ls-cue-line" aria-hidden="true" />
            Scroll to begin your journey
          </div>
        </div>
      </section>

      {/* The journey in a few lines */}
      <section className="ls-wrap ls-summary" style={{ paddingBlock: 'clamp(5rem, 13vw, 11rem)' }}>
        <div style={{ maxWidth: '62rem', marginInline: 'auto' }}>
          <p data-reveal style={{ color: 'var(--forest-700)', fontSize: '0.95rem', fontWeight: 500 }}>Your journey</p>
          <p data-split className="ls-display" style={{ marginTop: '1rem', fontSize: 'clamp(1.6rem, 2.9vw, 2.6rem)', lineHeight: 1.22, letterSpacing: '-0.015em' }}>
            {itinerary.summary}
          </p>
          {price ? (
            <div data-reveal style={{ marginTop: '3rem', paddingTop: '1.5rem', borderTop: '1px solid rgb(194 162 102 / 0.55)', display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: '0.5rem 2rem' }}>
              <span style={{ color: 'var(--ink-soft)', fontSize: '0.95rem' }}>Journey price</span>
              <span className="ls-display" style={{ color: '#a08045', fontSize: 'clamp(1.6rem, 2.6vw, 2.4rem)' }}>{price}</span>
            </div>
          ) : null}
          {hasMap ? (
            <div className="ls-print-route" aria-hidden="true">
              <h2 className="ls-display">Your route</h2>
              <svg viewBox={MAP_VIEWBOX} fill="none">
                <path d={MAP_OUTLINE} fill="#e9e2d0" stroke="#1d3a2a" strokeOpacity={0.35} strokeWidth={1.2} />
                {route.paths.map((d, i) => (d ? <path key={i} d={d} stroke="#a08045" strokeWidth={3} strokeLinecap="round" /> : null))}
                {route.returnPath ? <path d={route.returnPath} stroke="#a08045" strokeWidth={3} strokeLinecap="round" strokeDasharray="2 7" /> : null}
                {route.stops.map((p) => (
                  <g key={p.name}>
                    <circle cx={p.at[0]} cy={p.at[1]} r={5} fill="#1d3a2a" />
                    <text x={p.at[0] > 260 ? p.at[0] - 10 : p.at[0] + 10} y={p.at[1] + 6} textAnchor={p.at[0] > 260 ? 'end' : 'start'} fill="#1d3a2a" fontSize={15} fontFamily="var(--sans)" stroke="#e9e2d0" strokeWidth={4} paintOrder="stroke">
                      {p.name}
                    </text>
                  </g>
                ))}
              </svg>
              <ol>
                {route.origin ? (
                  <li>
                    <span>Arrival</span>
                    {route.origin.name}
                  </li>
                ) : null}
                {nights.map((n) => (
                  <li key={`${n.from}-${n.name}`}>
                    <span>{n.from === n.to ? `Day ${n.from}` : `Days ${n.from} to ${n.to}`}</span>
                    {n.name}
                  </li>
                ))}
                {route.departure ? (
                  <li>
                    <span>Departure</span>
                    {route.departure.name}
                  </li>
                ) : null}
              </ol>
            </div>
          ) : null}
        </div>
      </section>

      {journey ? (
        <JourneyDays days={days} route={route} startDate={startDate} />
      ) : (
        <>
      {/* Day by day, with the island beside the days */}
      <section className={`ls-days ${hasMap ? 'has-map' : ''}`}>
        {hasMap ? (
          <div className="ls-map-bar">
            {/* Phones: a slim bar above the days. */}
            <div className="flex lg:hidden" style={{ alignItems: 'center', gap: '1rem', height: '5.25rem', paddingInline: 'var(--gutter)' }}>
              {map(false, 'h-full w-auto py-2')}
              <p style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: '0.85rem', color: 'var(--mist)' }}>
                  Day {current ? dayHeading(current).day : 1} of {days.length}
                </span>
                <span className="ls-display" style={{ display: 'block', fontSize: '1.35rem', lineHeight: 1.15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {activeStay?.name || current?.location}
                </span>
              </p>
            </div>
            {/* Large screens: a pinned column. */}
            <div className="hidden lg:flex" style={{ height: '100%', flexDirection: 'column', justifyContent: 'space-between', padding: '3rem clamp(2rem, 4vw, 4rem) 2.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '1.5rem' }}>
                <p className="ls-display" style={{ fontSize: 'clamp(2.5rem, 4vw, 4rem)', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                  Day {current ? dayHeading(current).day : 1}
                </p>
                <p style={{ textAlign: 'right', color: 'var(--mist)' }}>
                  {days.length} days · {activeStay?.name || current?.location}
                </p>
              </div>
              {map(true, 'mx-auto h-[min(68svh,44rem)] w-auto')}
            </div>
          </div>
        ) : null}

        <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {days.map((day, i) => {
            const h = dayHeading(day)
            const date = fmt(localDate(startDate, h.day - 1), { weekday: 'long', day: 'numeric', month: 'long' })
            return (
              <li
                key={`${day.day}-${i}`}
                data-day={i}
                className={`ls-wrap ${hasMap ? 'lg:min-h-svh lg:content-center' : ''}`}
                style={{ display: 'grid', gap: '2rem', paddingBlock: 'clamp(2.75rem, 8vh, 7rem)', maxWidth: hasMap ? undefined : '72rem', paddingInline: hasMap ? 'clamp(1.25rem, 5vw, 5rem)' : undefined }}
              >
                {day.image ? (
                  <div data-clip className="ls-frame">
                    <div className="ls-frame-inner">
                      <StoryPhoto src={day.image} alt={day.title || day.location} sizes={hasMap ? '(min-width: 1024px) 55vw, 100vw' : '(min-width: 1152px) 1100px, 100vw'} />
                    </div>
                  </div>
                ) : null}
                <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)] md:gap-10">
                  <div>
                    <p data-reveal style={{ color: 'var(--forest-700)', fontSize: '0.95rem', fontWeight: 500 }}>
                      Day {h.day}
                      {date ? <span style={{ color: 'var(--ink-soft)', fontWeight: 400 }}> · {date}</span> : null}
                    </p>
                    <h2 data-split style={{ marginTop: '0.5rem', fontSize: 'clamp(2rem, 3.2vw, 3.25rem)', lineHeight: 1.04 }}>
                      {h.title}
                    </h2>
                    {day.location ? (
                      <p data-reveal style={{ marginTop: '0.85rem', color: '#a08045', fontSize: '0.8rem', fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
                        {day.location}
                      </p>
                    ) : null}
                    {day.what_to_expect ? (
                      <p data-reveal style={{ marginTop: '1.25rem', color: 'var(--ink-soft)' }}>
                        {day.what_to_expect}
                      </p>
                    ) : null}
                  </div>
                  {day.activities && day.activities.length > 0 ? (
                    <div className="md:pt-9">
                      <p data-reveal className="ls-display" style={{ fontSize: '1.25rem' }}>The day</p>
                      <ul data-reveal-group style={{ listStyle: 'none', margin: '0.75rem 0 0', padding: 0, display: 'grid', gap: '0.6rem', fontSize: '1rem' }}>
                        {day.activities.map((a, j) => (
                          <li key={j} style={{ display: 'flex', gap: '0.8rem' }}>
                            <span className="ls-dot" aria-hidden="true" />
                            <span>{a}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ol>
      </section>
        </>
      )}

      {vehicle ? (
        <section className="ls-dark" style={{ background: 'var(--forest-900)', color: 'var(--ivory)' }}>
          <div className="ls-wrap grid gap-10 lg:grid-cols-12 lg:items-center" style={{ paddingBlock: 'clamp(5rem, 11vw, 9rem)' }}>
            <div className="lg:col-span-5">
              <p data-reveal style={{ color: 'var(--gold-bright)', fontSize: '0.95rem' }}>Your vehicle</p>
              <h2 data-split style={{ marginTop: '0.75rem', fontSize: 'clamp(2.25rem, 4.4vw, 4.25rem)', lineHeight: 1 }}>{vehicle.name}</h2>
              {vehicle.description ? (
                <p data-reveal style={{ marginTop: '1.5rem', color: 'rgb(244 239 228 / 0.82)', maxWidth: '44ch' }}>{vehicle.description}</p>
              ) : null}
            </div>
            {vehicle.images?.[0] ? (
              <div data-clip className="ls-frame lg:col-span-7" style={{ background: 'var(--forest-800)' }}>
                <div className="ls-frame-inner">
                  <StoryPhoto src={vehicle.images[0]} alt={vehicle.name} sizes="(min-width: 1024px) 58vw, 100vw" />
                </div>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {extras}

      {/* Sign-off */}
      <section className="ls-dark ls-signoff" style={{ background: 'var(--forest-950)', color: 'var(--ivory)', textAlign: 'center' }}>
        <div className="ls-wrap" style={{ paddingBlock: 'clamp(5rem, 12vw, 10rem)', display: 'grid', justifyItems: 'center', gap: '1.5rem' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img data-reveal src={BRAND.logoMarkSrc} alt="" width={56} height={56} style={{ width: 56, height: 56 }} />
          <p data-split className="ls-display" style={{ fontSize: 'clamp(2.25rem, 5vw, 4.5rem)', lineHeight: 1.02, maxWidth: '18ch' }}>
            Until we meet in Sri Lanka
          </p>
          <a data-reveal href={BRAND.websiteUrl} style={{ color: 'var(--gold-bright)', fontSize: '0.95rem', textDecoration: 'none', borderBottom: '1px solid rgb(212 184 120 / 0.5)', paddingBottom: '0.15rem' }}>
            lankalux.com
          </a>
          <button type="button" className="ls-print" onClick={() => window.print()}>
            Print or save as PDF
          </button>
        </div>
      </section>
    </div>
  )
}
