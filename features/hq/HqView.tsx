'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { consoleFetch } from '@/lib/console-api'
import { sendNotice, type SendResult } from '@/features/console/AiApprovalCard'
import {
  agentStatesAt,
  botNode,
  buildTimeline,
  describeView,
  emptyStore,
  eventsBetween,
  LIVE_LAG_MS,
  mergeSnapshot,
  nextActivityAfter,
  nextSince,
  nodeName,
  shortName,
  OWNER,
  GATEWAY,
  type AgentView,
  type HqEvent,
  type HqStore,
  type NodeKey,
} from '@/features/hq/engine'
import { anchorFor, plotFor } from '@/features/hq/layout'
import { HqPanel } from '@/features/hq/HqPanel'
import { Feed, Notifications, TimelineStrip } from '@/features/hq/HqHud'
import type { Pulse } from '@/features/hq/world/Pulses'
import type { Quality, WorldHandle } from '@/features/hq/world/World'
import type { HqSnapshot } from '@/services/ai-hq.service'
import '@/features/hq/hq.css'
import { ago, clock, PULSE_MS, REPLAY_SPEEDS, type HqMode } from '@/features/hq/format'

// three.js only loads on this view, so the rest of admin stays as light as before.
const World = dynamic(() => import('@/features/hq/world/World').then((m) => m.World), {
  ssr: false,
  loading: () => <div className="hq-loading">Building the headquarters…</div>,
})

/** How often the page asks for changes while visible, and while the tab is in the background. */
const POLL_MS = 4000
const POLL_HIDDEN_MS = 30000
/** How often robot states are recomputed (the 3D scene animates every frame in between). */
const TICK_MS = 250
/** Live view counts as quiet when nothing has happened for this long. */
const QUIET_AFTER_MS = 10 * 60 * 1000

const PULSE_COLOR: Record<HqEvent['kind'], string> = {
  inbound: '#4ea8ff',
  delegate: '#2cc4ea',
  report: '#22c98a',
  finish: '#22c98a',
  fail: '#ff4d5e',
  retry: '#ff4d5e',
  propose: '#8a7cff',
  ask_owner: '#ffb020',
  decision: '#ffd36b',
  outbound: '#22c98a',
  message: '#4ea8ff',
  owner: '#ffd36b',
  bot: '#e9825e',
}

/** Can this device draw the 3D world? (WebGL, and not a very small device.) */
function canRender3d(): { ok: boolean; quality: Quality } {
  try {
    const canvas = document.createElement('canvas')
    const gl = (canvas.getContext('webgl2') || canvas.getContext('webgl')) as WebGLRenderingContext | null
    if (!gl) return { ok: false, quality: 'medium' }
    const nav = navigator as Navigator & { deviceMemory?: number }
    const weak = (nav.deviceMemory !== undefined && nav.deviceMemory < 2) || (navigator.hardwareConcurrency || 4) < 2
    const strong = (navigator.hardwareConcurrency || 4) >= 8 && !/Mobi|Android/i.test(navigator.userAgent)
    return { ok: !weak, quality: strong ? 'high' : 'medium' }
  } catch {
    return { ok: false, quality: 'medium' }
  }
}

let support3d: { ok: boolean; quality: Quality } | undefined
const noSubscribe = () => () => {}
const supportSnapshot = () => (support3d ??= canRender3d())
const REDUCED = '(prefers-reduced-motion: reduce)'
const reducedSubscribe = (on: () => void) => {
  const mq = window.matchMedia(REDUCED)
  mq.addEventListener('change', on)
  return () => mq.removeEventListener('change', on)
}

export function HqView({ onClassic }: { onClassic: (reason?: string) => void }) {
  const [store, setStore] = useState<HqStore>(emptyStore)
  const storeRef = useRef(store)
  const [error, setError] = useState<string | null>(null)
  // Measured in the browser only (null while rendering on the server).
  const support = useSyncExternalStore(noSubscribe, supportSnapshot, () => null)
  const reducedMotion = useSyncExternalStore(reducedSubscribe, () => window.matchMedia(REDUCED).matches, () => false)
  const [degraded, setDegraded] = useState(false)
  const [force3d, setForce3d] = useState(false)
  const [mode, setMode] = useState<HqMode>({ kind: 'live' })
  const modeRef = useRef(mode)
  const [views, setViews] = useState<Map<NodeKey, AgentView>>(new Map())
  const [playhead, setPlayhead] = useState(0)
  const [pulses, setPulses] = useState<Pulse[]>([])
  const [selected, setSelected] = useState<NodeKey | null>(null)
  const [feedOpen, setFeedOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const world = useRef<WorldHandle>(null)

  // The ticker below reads the latest store and mode through refs.
  useEffect(() => {
    storeRef.current = store
  }, [store])
  useEffect(() => {
    modeRef.current = mode
  }, [mode])

  // --- Data: the last day once, then only changes ------------------------------------------
  const load = useCallback(async (full = false) => {
    const since = full ? null : nextSince(storeRef.current)
    const res = (await consoleFetch(`/api/v2/ai/hq${since ? `?since=${encodeURIComponent(since)}` : ''}`)) as { hq: HqSnapshot }
    setStore((s) => mergeSnapshot(full ? emptyStore() : s, res.hq))
    setError(null)
  }, [])

  useEffect(() => {
    let stop = false
    let timer: ReturnType<typeof setTimeout>
    const loop = async () => {
      try {
        await load()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load the AI Headquarters.')
      }
      if (!stop) timer = setTimeout(loop, document.visibilityState === 'visible' ? POLL_MS : POLL_HIDDEN_MS)
    }
    loop()
    return () => {
      stop = true
      clearTimeout(timer)
    }
  }, [load])

  const timeline = useMemo(() => buildTimeline(store), [store])
  const timelineRef = useRef(timeline)
  useEffect(() => {
    timelineRef.current = timeline
  }, [timeline])
  // Stable lists (each poll brings new arrays with the same keys).
  const agentList = store.agents.map((a) => a.key).join(',')
  const botList = store.bots.map((b) => b.key).join(',')
  const agentKeys = useMemo(() => (agentList ? agentList.split(',') : []), [agentList])
  const botKeys = useMemo(() => (botList ? botList.split(',') : []), [botList])

  // --- The playhead: a few seconds behind the clock live, or anywhere in the day in Replay ---------
  const lastT = useRef(0)
  const lastReal = useRef(0)
  useEffect(() => {
    const id = setInterval(() => {
      const s = storeRef.current
      const tl = timelineRef.current
      if (!s.lastServerNow) return
      const nowServer = Date.now() + s.clockOffset
      const m = modeRef.current
      const real = performance.now()
      const realDt = lastReal.current ? real - lastReal.current : TICK_MS
      lastReal.current = real
      let T: number
      let scale = 1
      if (m.kind === 'live') {
        T = nowServer - LIVE_LAG_MS
      } else {
        scale = m.speed
        T = m.playing ? m.at + realDt * m.speed : m.at
        // Skip quiet stretches so Replay keeps moving; nothing is shown that did not happen.
        if (m.playing) {
          const busyNow = [...(tl.byNode.values())].some((spans) => spans.some((sp) => sp.start <= T && (sp.end ?? Infinity) >= T))
          const next = nextActivityAfter(tl, T)
          if (!busyNow && next !== null && next - T > 4000 * m.speed) T = next - 1500 * m.speed
          else if (!busyNow && next === null) T = nowServer
        }
        // Caught up with the present: carry on live.
        if (T >= nowServer - LIVE_LAG_MS) {
          T = nowServer - LIVE_LAG_MS
          scale = 1
          modeRef.current = { kind: 'live' }
          setMode(modeRef.current)
        } else if (m.playing) {
          modeRef.current = { ...m, at: T }
          setMode(modeRef.current)
        }
      }
      // Pulses for the hand-offs the playhead just passed (not a backlog after a jump).
      const from = lastT.current
      if (from && T > from && T - from < 20_000 * scale) {
        const fresh = eventsBetween(tl, from, T).filter((e) => e.to && e.to !== e.actor)
        if (fresh.length) {
          const born = performance.now()
          const keys = s.agents.map((a) => a.key)
          const bots = s.bots.map((b) => b.key)
          setPulses((p) => [
            ...p.filter((x) => born - x.born < PULSE_MS),
            ...fresh.slice(-8).map((e, i) => ({
              id: `${e.id}:${born}`,
              from: anchorFor(e.actor, keys, bots),
              to: anchorFor(e.to!, keys, bots),
              color: PULSE_COLOR[e.kind],
              born: born + i * 120,
            })),
          ])
        }
      }
      setPulses((p) => (p.length && p.some((x) => performance.now() - x.born >= PULSE_MS) ? p.filter((x) => performance.now() - x.born < PULSE_MS) : p))
      lastT.current = T
      setPlayhead(T)
      setViews(agentStatesAt(s, tl, T, { live: m.kind === 'live', now: nowServer, scale }))
    }, TICK_MS)
    return () => clearInterval(id)
  }, [])

  // --- Actions (the same endpoints as the classic view) ---------------------------------------------
  async function send(path: string, method: string, body: unknown) {
    setBusy(true)
    setNotice(null)
    try {
      const res = await consoleFetch(path, { method, body: JSON.stringify(body) })
      setNotice(sendNotice((res as { send?: SendResult }).send ?? null) ?? 'Saved.')
      await load()
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  function decide(id: string, decision: 'approve' | 'reject', text?: string) {
    if (decision === 'reject' && !window.confirm('Reject this action? The agent will not run it.')) return
    send(`/api/v2/ai/actions/${id}`, 'POST', { decision, text })
  }

  const select = useCallback((node: NodeKey | null) => {
    setSelected(node)
    world.current?.focus(node)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') select(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [select])

  // --- Derived for the HUD ---------------------------------------------------------------------------
  const live = mode.kind === 'live'
  const names = useMemo(() => {
    const out: Record<NodeKey, string> = {}
    // Short names on the tags ("Sales", "AI Manager"); the panel shows the full one.
    for (const a of store.agents) out[a.key] = shortName({ agents: store.agents, bots: store.bots }, a.key)
    for (const b of store.bots) out[botNode(b.key)] = b.name.replace(/^Social media manager: /, '')
    return out
  }, [store.agents, store.bots])
  const screens = useMemo(() => {
    const out: Record<NodeKey, string> = {}
    for (const [node, v] of views) {
      if (v.state === 'idle') {
        const last = [...timeline.events].reverse().find((e) => e.actor === node && e.t <= playhead && (e.kind === 'finish' || e.kind === 'report' || e.kind === 'outbound'))
        out[node] = last ? `Idle · last done ${ago(playhead - last.t)} ago` : 'Idle · nothing yet today'
      } else out[node] = describeView(v)
    }
    return out
  }, [views, timeline, playhead])
  const pending = useMemo(() => [...store.actions.values()].filter((a) => a.status === 'proposed' && a.needs_owner), [store.actions])
  const working = [...views.values()].filter((v) => v.state === 'working' || v.state === 'thinking').length
  const workerSeen = store.agents.reduce<number>((t, a) => (a.key !== 'concierge' && a.last_heartbeat_at ? Math.max(t, Date.parse(a.last_heartbeat_at)) : t), 0)
  // In live view the playhead runs LIVE_LAG_MS behind the server clock.
  const serverOnline = workerSeen > 0 && playhead + LIVE_LAG_MS - workerSeen < 3 * 60 * 1000
  const lastAny = timeline.events.length ? timeline.events[timeline.events.length - 1].t : 0
  const quiet = live && !working && playhead - lastAny > QUIET_AFTER_MS

  function startReplay(at?: number) {
    const start = at ?? store.windowStart
    lastT.current = 0
    setPulses([])
    setMode({ kind: 'replay', at: start, speed: REPLAY_SPEEDS[0], playing: true })
  }
  function goLive() {
    lastT.current = 0
    setPulses([])
    setMode({ kind: 'live' })
  }

  if (support && !support.ok && !force3d) {
    return (
      <div className="hq-fallback ll-card">
        <h2>This device can’t draw the 3D headquarters</h2>
        <p className="ll-muted">It needs WebGL and a little more graphics power. The classic control room shows the same live data.</p>
        <div className="ll-row" style={{ gap: 8 }}>
          <button type="button" className="ll-btn" onClick={() => onClassic()}>
            Open the classic view
          </button>
          <button type="button" className="ll-btn secondary" onClick={() => setForce3d(true)}>
            Try 3D anyway
          </button>
        </div>
      </div>
    )
  }

  const selectedName = selected ? nodeName(store, selected).replace(/^Social media manager: /, '') : ''

  return (
    <div className={`hq ${selected ? 'with-panel' : ''}`}>
      <div className="hq-stage">
        {support && store.lastServerNow && (
          <World
            ref={world}
            agentKeys={agentKeys}
            botKeys={botKeys}
            names={names}
            views={views}
            screens={screens}
            pulses={pulses}
            pendingForOwner={pending.length}
            selected={selected}
            onSelect={select}
            quality={degraded ? 'medium' : support.quality}
            onQualityDrop={() => setDegraded(true)}
            reducedMotion={reducedMotion}
          />
        )}
        {!store.lastServerNow && !error && <div className="hq-loading">Connecting to the agents…</div>}

        {/* Top bar */}
        <div className="hq-top">
          <div className="hq-glass hq-status">
            <span className={`hq-live ${live ? (serverOnline && !store.settings?.system_paused ? 'on' : 'off') : 'replay'}`}>
              {live ? (store.settings?.system_paused ? 'Paused' : serverOnline ? 'Live' : 'Agent server offline') : 'Replay'}
            </span>
            <span className="hq-muted">
              {live
                ? `${working ? `${working} working` : 'Nobody working'} · ${pending.length ? `${pending.length} need${pending.length === 1 ? 's' : ''} you` : 'nothing waiting for you'}`
                : `${clock(playhead)} · real events from the last ${store.lastServerNow ? 24 : 0} hours`}
            </span>
          </div>
          <div className="hq-top-right">
            <Notifications
              store={store}
              pending={pending}
              onOpen={(node) => select(node)}
            />
            <button type="button" className="hq-glass hq-btn" onClick={() => setFeedOpen((o) => !o)} aria-pressed={feedOpen}>
              Activity
            </button>
            <button type="button" className="hq-glass hq-btn" onClick={() => world.current?.home()} title="Back to the whole headquarters">
              Overview
            </button>
            <button type="button" className="hq-glass hq-btn" onClick={() => onClassic()}>
              Classic view
            </button>
          </div>
        </div>

        {error && <div className="hq-glass hq-toast bad">{error}</div>}
        {notice && (
          <button type="button" className="hq-glass hq-toast" onClick={() => setNotice(null)}>
            {notice}
          </button>
        )}
        {quiet && !selected && (
          <div className="hq-glass hq-quiet">
            <strong>All quiet right now.</strong>
            <span>
              The agents last did something {ago(playhead - lastAny)} ago. They run on a schedule and take a few minutes per reply, so most of the day looks like this.
            </span>
            <button type="button" className="ll-btn small" onClick={() => startReplay()}>
              Replay the last 24 hours
            </button>
          </div>
        )}

        {feedOpen && <Feed timeline={timeline} playhead={playhead} onSelect={select} onClose={() => setFeedOpen(false)} />}

        <TimelineStrip
          store={store}
          timeline={timeline}
          playhead={playhead}
          mode={mode}
          onSeek={(t) => startReplay(t)}
          onLive={goLive}
          onReplay={() => startReplay()}
          onMode={setMode}
        />
      </div>

      {selected && (
        <HqPanel
          node={selected}
          name={selectedName}
          plot={plotFor(selected, agentKeys)}
          store={store}
          timeline={timeline}
          view={views.get(selected)}
          playhead={playhead}
          live={live}
          busy={busy}
          pending={selected === OWNER ? pending : pending.filter((a) => a.agent_key === selected)}
          onDecide={decide}
          onPause={(key, paused) => send(`/api/v2/ai/agents/${key}`, 'PATCH', { paused })}
          onSelect={select}
          onClose={() => select(null)}
          isGateway={selected === GATEWAY}
        />
      )}
    </div>
  )
}
