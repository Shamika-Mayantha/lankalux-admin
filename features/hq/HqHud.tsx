'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Bell, Pause, Play, Radio, X } from 'lucide-react'
import { formatAgo } from '@/lib/format'
import { OWNER, shortName, type HqEvent, type HqStore, type NodeKey, type Timeline } from '@/features/hq/engine'
import { clock, REPLAY_SPEEDS, type HqMode } from '@/features/hq/format'
import type { HqAction } from '@/services/ai-hq.service'

/** The bell: real approvals waiting for you, and the AI Manager's unread pings. */
export function Notifications({ store, pending, onOpen }: { store: HqStore; pending: HqAction[]; onOpen: (node: NodeKey) => void }) {
  const [open, setOpen] = useState(false)
  const count = pending.length + store.pings.length
  return (
    <div className="hq-bell-wrap">
      <button type="button" className={`hq-glass hq-btn hq-bell ${count ? 'alert' : ''}`} onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={`Notifications (${count})`}>
        <Bell size={16} aria-hidden />
        {count > 0 && <b>{count}</b>}
      </button>
      {open && (
        <div className="hq-glass hq-drop" role="dialog" aria-label="Notifications">
          <div className="hq-drop-head">
            <strong>Needs you</strong>
            <button type="button" className="hq-x" onClick={() => setOpen(false)} aria-label="Close">
              <X size={15} />
            </button>
          </div>
          {count === 0 && <p className="hq-muted">Nothing is waiting for you.</p>}
          <ul>
            {pending.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false)
                    onOpen(a.agent_key)
                  }}
                >
                  <span className="hq-dot warn" />
                  <span>
                    <strong>{shortName(store, a.agent_key)}</strong> needs your approval
                    <small>{a.summary}</small>
                    <small>{formatAgo(a.created_at)}</small>
                  </span>
                </button>
              </li>
            ))}
            {store.pings.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false)
                    onOpen(OWNER)
                  }}
                >
                  <span className={`hq-dot ${p.kind === 'error' ? 'bad' : 'warn'}`} />
                  <span>
                    <strong>{p.title}</strong>
                    {p.body && <small>{p.body}</small>}
                    <small>{formatAgo(p.created_at)}</small>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

/** The activity feed: every real event up to the playhead, newest first. */
export function Feed({ timeline, playhead, onSelect, onClose }: { timeline: Timeline; playhead: number; onSelect: (n: NodeKey) => void; onClose: () => void }) {
  const items = useMemo(() => {
    const out: HqEvent[] = []
    for (let i = timeline.events.length - 1; i >= 0 && out.length < 60; i--) {
      const e = timeline.events[i]
      if (e.t <= playhead) out.push(e)
    }
    return out
  }, [timeline, playhead])
  return (
    <aside className="hq-glass hq-feed" aria-label="Activity">
      <div className="hq-drop-head">
        <strong>Activity</strong>
        <button type="button" className="hq-x" onClick={onClose} aria-label="Close">
          <X size={15} />
        </button>
      </div>
      {items.length === 0 ? (
        <p className="hq-muted">Nothing in the last 24 hours yet.</p>
      ) : (
        <ol>
          {items.map((e) => (
            <li key={e.id} className={`t-${e.tone}`}>
              <button type="button" onClick={() => onSelect(e.actor)}>
                <span className={`hq-dot ${e.tone}`} />
                <span>
                  {e.text}
                  <small>
                    {clock(e.t)}
                    {e.request_id && (
                      <>
                        {' · '}
                        <Link href={`/console/requests/${e.request_id}`} onClick={(ev) => ev.stopPropagation()}>
                          {e.request_id}
                        </Link>
                      </>
                    )}
                  </small>
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
      <p className="hq-muted hq-small">From the agents&apos; activity log, tasks, approvals and messages.</p>
    </aside>
  )
}

/** The day at the bottom: every real event as a tick, the playhead, and the Live / Replay controls. */
export function TimelineStrip({
  store,
  timeline,
  playhead,
  mode,
  onSeek,
  onLive,
  onReplay,
  onMode,
}: {
  store: HqStore
  timeline: Timeline
  playhead: number
  mode: HqMode
  onSeek: (t: number) => void
  onLive: () => void
  onReplay: () => void
  onMode: (m: HqMode) => void
}) {
  const start = store.windowStart
  const end = store.lastServerNow ? Date.parse(store.lastServerNow) : start + 1
  const span = Math.max(1, end - start)
  const pos = (t: number) => `${Math.min(100, Math.max(0, ((t - start) / span) * 100))}%`
  const hours = useMemo(() => {
    const out: number[] = []
    const h = new Date(start)
    h.setMinutes(0, 0, 0)
    for (let t = h.getTime() + 3600_000; t < end; t += 3 * 3600_000) out.push(t)
    return out
  }, [start, end])
  const ticks = useMemo(() => timeline.events.filter((e) => e.t >= start), [timeline, start])
  const work = useMemo(() => timeline.spans.filter((s) => s.kind === 'work' && s.start >= start), [timeline, start])

  return (
    <div className="hq-glass hq-strip">
      <div className="hq-strip-controls">
        {mode.kind === 'live' ? (
          <button type="button" className="hq-btn hq-chip" onClick={onReplay} title="Play back the real events of the last 24 hours">
            <Play size={14} aria-hidden /> Replay 24h
          </button>
        ) : (
          <>
            <button type="button" className="hq-btn hq-chip" onClick={() => onMode({ ...mode, playing: !mode.playing })} aria-label={mode.playing ? 'Pause replay' : 'Play replay'}>
              {mode.playing ? <Pause size={14} aria-hidden /> : <Play size={14} aria-hidden />}
            </button>
            <div className="hq-speeds" role="group" aria-label="Replay speed">
              {REPLAY_SPEEDS.map((s) => (
                <button key={s} type="button" className={mode.speed === s ? 'on' : ''} onClick={() => onMode({ ...mode, speed: s })}>
                  {s}×
                </button>
              ))}
            </div>
            <button type="button" className="hq-btn hq-chip live" onClick={onLive}>
              <Radio size={14} aria-hidden /> Back to live
            </button>
          </>
        )}
      </div>
      <div
        className="hq-track"
        role="slider"
        tabIndex={0}
        aria-label="Timeline of the last 24 hours"
        aria-valuemin={start}
        aria-valuemax={end}
        aria-valuenow={playhead}
        aria-valuetext={clock(playhead)}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          onSeek(start + ((e.clientX - r.left) / r.width) * span)
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') onSeek(Math.max(start, playhead - 15 * 60_000))
          if (e.key === 'ArrowRight') onSeek(Math.min(end, playhead + 15 * 60_000))
        }}
      >
        {work.map((s) => (
          <span key={s.id} className="hq-span" style={{ left: pos(s.start), width: `max(2px, ${(((s.end ?? end) - s.start) / span) * 100}%)` }} />
        ))}
        {ticks.map((e) => (
          <span key={e.id} className={`hq-tick ${e.tone}`} style={{ left: pos(e.t) }} />
        ))}
        {hours.map((t) => (
          <span key={t} className="hq-hour" style={{ left: pos(t) }}>
            {clock(t)}
          </span>
        ))}
        <span className={`hq-head ${mode.kind}`} style={{ left: pos(playhead) }} />
      </div>
    </div>
  )
}
