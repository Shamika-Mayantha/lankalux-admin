import { capitalise, taskLabel } from '@/features/console/ai-labels'
import type { HqAction, HqActivity, HqApproval, HqMessage, HqSnapshot, HqTask } from '@/services/ai-hq.service'
import type { AiAgent, AiPing } from '@/services/ai-console.service'
import type { ClaudeBot } from '@/services/claude-bots.service'

/**
 * The AI Headquarters' brain, with no React or 3D in it: it merges what the server sends,
 * turns the real rows into a timeline (who did what, who handed what to whom), and says what
 * each agent is doing at any moment of that timeline. Live view asks about "a few seconds ago";
 * Replay asks about any moment of the last day. Nothing here invents activity: every event and
 * span points back to a task, action, approval, message or log row.
 */

/** A place in the world: an agent key, the owner's balcony, the customer gateway, or a Claude bot. */
export type NodeKey = string
export const OWNER: NodeKey = 'owner'
export const GATEWAY: NodeKey = 'gateway'
export const CONCIERGE = 'concierge'
export const botNode = (key: string): NodeKey => `bot:${key}`

/** A worker that has not checked in for this long is shown as offline (same as the classic view). */
export const OFFLINE_AFTER_MS = 3 * 60 * 1000
/** Live view plays this far behind the clock, so every change is seen in order, never skipped. */
export const LIVE_LAG_MS = 6000

export type HqStore = {
  settings: HqSnapshot['settings'] | null
  agents: AiAgent[]
  tasks: Map<string, HqTask>
  activity: Map<number, HqActivity>
  actions: Map<string, HqAction>
  approvals: Map<string, HqApproval>
  messages: Map<string, HqMessage>
  pings: AiPing[]
  bots: ClaudeBot[]
  summary: HqSnapshot['summary']
  /** server clock minus browser clock, so "now" matches the heartbeats. */
  clockOffset: number
  /** Oldest moment the store covers (start of the first full load). */
  windowStart: number
  /** server_now of the last load: the next call asks for changes since a little before it. */
  lastServerNow: string | null
}

export function emptyStore(): HqStore {
  return {
    settings: null,
    agents: [],
    tasks: new Map(),
    activity: new Map(),
    actions: new Map(),
    approvals: new Map(),
    messages: new Map(),
    pings: [],
    bots: [],
    summary: null,
    clockOffset: 0,
    windowStart: 0,
    lastServerNow: null,
  }
}

function upsert<K, V>(base: Map<K, V>, rows: V[], key: (row: V) => K, replace: boolean): Map<K, V> {
  const next = replace ? new Map<K, V>() : new Map(base)
  for (const row of rows) next.set(key(row), row)
  return next
}

/** Merges a server snapshot. A full snapshot replaces the store; a partial one updates rows by id. */
export function mergeSnapshot(store: HqStore, snap: HqSnapshot, receivedAt = Date.now()): HqStore {
  const serverNow = Date.parse(snap.server_now)
  const full = snap.full
  const windowStart = full ? serverNow - snap.window_hours * 3600_000 : store.windowStart
  const keep = <V extends { created_at: string }>(m: Map<string | number, V>) => {
    // Drop rows that have slid out of the window, so a page left open all week stays light.
    for (const [k, v] of m) if (Date.parse(v.created_at) < windowStart && !('status' in v && (v as { status: string }).status === 'proposed')) m.delete(k)
    return m
  }
  return {
    settings: snap.settings,
    agents: snap.agents,
    tasks: keep(upsert(store.tasks, snap.tasks, (t) => t.id, full)) as Map<string, HqTask>,
    activity: keep(upsert(store.activity, snap.activity, (a) => a.id, full)) as Map<number, HqActivity>,
    actions: keep(upsert(store.actions, snap.actions, (a) => a.id, full)) as Map<string, HqAction>,
    approvals: keep(upsert(store.approvals, snap.approvals, (a) => a.id, full)) as Map<string, HqApproval>,
    messages: keep(upsert(store.messages, snap.messages, (m) => m.id, full)) as Map<string, HqMessage>,
    pings: snap.pings,
    bots: snap.bots,
    summary: snap.summary,
    clockOffset: serverNow - receivedAt,
    windowStart,
    lastServerNow: snap.server_now,
  }
}

/** The `since` to ask the server for next: a little before the last read, so nothing falls in a gap. */
export function nextSince(store: HqStore): string | null {
  if (!store.lastServerNow) return null
  return new Date(Date.parse(store.lastServerNow) - 15_000).toISOString()
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

export type EventKind =
  | 'inbound' // a CRM / WhatsApp event or a website visitor reached an agent
  | 'delegate' // one agent queued work for another
  | 'report' // finished work went back to the agent that asked for it
  | 'finish'
  | 'fail'
  | 'retry'
  | 'propose' // an agent proposed an action
  | 'ask_owner' // ...that waits for the owner
  | 'decision' // the Manager or the owner decided on an action
  | 'outbound' // something went out to a customer
  | 'message' // a customer message (shown in the feed)
  | 'owner' // the owner changed something
  | 'bot' // a Claude bot run

export type HqEvent = {
  id: string
  t: number
  kind: EventKind
  actor: NodeKey
  /** Set when something travels between two places: drawn as a pulse of light. */
  to?: NodeKey
  text: string
  tone: 'info' | 'good' | 'warn' | 'bad'
  request_id?: string | null
  task_id?: string | null
  action_id?: string | null
}

export type Span = {
  id: string
  node: NodeKey
  kind: 'work' | 'think'
  start: number
  /** null while it is still going. */
  end: number | null
  label: string
  request_id?: string | null
  task_id?: string | null
}

export type Timeline = {
  events: HqEvent[]
  spans: Span[]
  /** Spans per node, for quick lookups. */
  byNode: Map<NodeKey, Span[]>
}

export const NODE_NAMES: Record<string, string> = {
  [OWNER]: 'You',
  [GATEWAY]: 'Customers and CRM',
}

export function nodeName(store: Pick<HqStore, 'agents' | 'bots'>, key: NodeKey | null | undefined): string {
  if (!key) return 'System'
  if (NODE_NAMES[key]) return NODE_NAMES[key]
  if (key.startsWith('bot:')) return store.bots.find((b) => botNode(b.key) === key)?.name || 'Claude bot'
  return store.agents.find((a) => a.key === key)?.name || key
}

/** "Sales Agent" reads better as "Sales" in a sentence. */
export function shortName(store: Pick<HqStore, 'agents' | 'bots'>, key: NodeKey | null | undefined): string {
  return nodeName(store, key).replace(/ Agent$/, '').replace(/^AI General Manager$/, 'AI Manager')
}

const ms = (iso: string | null | undefined) => (iso ? Date.parse(iso) : NaN)

function clip(text: string, max = 90) {
  const t = text.replace(/\s+/g, ' ').trim()
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

export function buildTimeline(store: HqStore): Timeline {
  const events: HqEvent[] = []
  const spans: Span[] = []
  const name = (k: NodeKey | null | undefined) => shortName(store, k)
  const activity = [...store.activity.values()].sort((a, b) => a.id - b.id)

  // How long each finished task took, from the worker's own log line.
  const seconds = new Map<string, number>()
  for (const a of activity) {
    if (a.task_id && (a.event === 'task.succeeded' || a.event === 'task.failed') && typeof a.detail?.seconds === 'number') {
      seconds.set(a.task_id, a.detail.seconds as number)
    }
  }

  for (const t of store.tasks.values()) {
    const parent = t.parent_task_id ? store.tasks.get(t.parent_task_id) : undefined
    const created = ms(t.created_at)
    // Hand-offs: a task another agent queued, or an event from the CRM / WhatsApp.
    if (parent && parent.agent_key !== t.agent_key) {
      events.push({
        id: `delegate:${t.id}`,
        t: created,
        kind: 'delegate',
        actor: parent.agent_key,
        to: t.agent_key,
        text: `${name(parent.agent_key)} asked ${name(t.agent_key)} to start ${taskLabel(t.task_type)}`,
        tone: 'info',
        request_id: t.request_id,
        task_id: t.id,
      })
    } else if (t.created_by === 'events') {
      events.push({
        id: `inbound:${t.id}`,
        t: created,
        kind: 'inbound',
        actor: GATEWAY,
        to: t.agent_key,
        text: `New ${t.request_id ? 'request update' : 'event'} for ${name(t.agent_key)}: ${taskLabel(t.task_type)}`,
        tone: 'info',
        request_id: t.request_id,
        task_id: t.id,
      })
    }
    // Working spans. A finished task ran for the seconds it logged; a running one since it was claimed.
    if (t.status === 'running') {
      spans.push({ id: `work:${t.id}`, node: t.agent_key, kind: 'work', start: ms(t.updated_at), end: null, label: taskLabel(t.task_type), request_id: t.request_id, task_id: t.id })
    } else if ((t.status === 'succeeded' || t.status === 'failed') && t.finished_at) {
      const end = ms(t.finished_at)
      const took = seconds.get(t.id)
      spans.push({ id: `work:${t.id}`, node: t.agent_key, kind: 'work', start: took !== undefined ? end - took * 1000 : end, end, label: taskLabel(t.task_type), request_id: t.request_id, task_id: t.id })
    }
    if (t.status === 'succeeded' && t.finished_at) {
      const back = parent && parent.agent_key !== t.agent_key ? parent.agent_key : undefined
      events.push({
        id: `finish:${t.id}`,
        t: ms(t.finished_at),
        kind: back ? 'report' : 'finish',
        actor: t.agent_key,
        to: back,
        text: back ? `${name(t.agent_key)} finished ${taskLabel(t.task_type)} and reported back to ${name(back)}` : `${name(t.agent_key)} finished ${taskLabel(t.task_type)}`,
        tone: 'good',
        request_id: t.request_id,
        task_id: t.id,
      })
    } else if (t.status === 'failed' && t.finished_at) {
      events.push({
        id: `fail:${t.id}`,
        t: ms(t.finished_at),
        kind: 'fail',
        actor: t.agent_key,
        text: `${name(t.agent_key)} could not finish ${taskLabel(t.task_type)}${t.error ? `: ${clip(t.error, 120)}` : ''}`,
        tone: 'bad',
        request_id: t.request_id,
        task_id: t.id,
      })
    }
  }

  // Model calls (thinking), retries, executed actions and the owner's own steps, from the log.
  const openThink = new Map<string, HqActivity>()
  for (const a of activity) {
    const at = ms(a.created_at)
    if (a.event === 'llm.start' && a.agent_key) {
      openThink.set(a.task_id || `agent:${a.agent_key}`, a)
    } else if (a.event === 'llm.end' && a.agent_key) {
      const key = a.task_id || `agent:${a.agent_key}`
      const start = openThink.get(key)
      openThink.delete(key)
      if (start) spans.push({ id: `think:${start.id}`, node: a.agent_key, kind: 'think', start: ms(start.created_at), end: at, label: 'thinking', request_id: a.request_id, task_id: a.task_id })
    } else if (a.event === 'task.retry' && a.agent_key) {
      events.push({
        id: `retry:${a.id}`,
        t: at,
        kind: 'retry',
        actor: a.agent_key,
        text: `${name(a.agent_key)} hit a problem and will retry${typeof a.detail?.error === 'string' ? `: ${clip(a.detail.error as string, 120)}` : ''}`,
        tone: 'bad',
        request_id: a.request_id,
        task_id: a.task_id,
      })
    } else if ((a.event === 'action.executed' || a.event === 'action.failed') && a.action_id) {
      const action = store.actions.get(a.action_id)
      const agent = action?.agent_key || a.agent_key
      if (!agent) continue
      const toCustomer = !!action && action.action_type.startsWith('message.') && a.event === 'action.executed'
      events.push({
        id: `exec:${a.id}`,
        t: at,
        kind: a.event === 'action.failed' ? 'fail' : toCustomer ? 'outbound' : 'finish',
        actor: agent,
        to: toCustomer ? GATEWAY : undefined,
        text: a.event === 'action.failed'
          ? `${name(agent)} could not complete: ${clip(action?.summary || 'an action')}`
          : toCustomer
            ? `${name(agent)}'s message went out: ${clip(action?.summary || '')}`
            : `${name(agent)} completed: ${clip(action?.summary || 'an action')}`,
        tone: a.event === 'action.failed' ? 'bad' : 'good',
        request_id: a.request_id,
        action_id: a.action_id,
      })
    } else if (a.actor_kind === 'owner' && !a.event.startsWith('action.')) {
      events.push({ id: `owner:${a.id}`, t: at, kind: 'owner', actor: OWNER, text: `You ${ownerVerb(a.event)}`, tone: 'info', request_id: a.request_id })
    } else if (a.event === 'website.request_created') {
      events.push({ id: `web:${a.id}`, t: at, kind: 'outbound', actor: CONCIERGE, to: GATEWAY, text: 'Website Concierge passed a website chat to the team as a new request', tone: 'good', request_id: a.request_id })
    }
  }
  // A model call still going has no end yet.
  for (const a of openThink.values()) {
    if (a.agent_key) spans.push({ id: `think:${a.id}`, node: a.agent_key, kind: 'think', start: ms(a.created_at), end: null, label: 'thinking', request_id: a.request_id, task_id: a.task_id })
  }

  // Proposed actions, and who decided on them.
  const decidedByOwner = new Set<string>()
  for (const ap of store.approvals.values()) if (ap.decided_by_kind === 'owner') decidedByOwner.add(ap.action_id)
  for (const ac of store.actions.values()) {
    const toOwner = ac.needs_owner || decidedByOwner.has(ac.id)
    events.push({
      id: `propose:${ac.id}`,
      t: ms(ac.created_at),
      kind: toOwner ? 'ask_owner' : 'propose',
      actor: ac.agent_key,
      to: toOwner ? OWNER : undefined,
      text: toOwner ? `${name(ac.agent_key)} needs your approval: ${clip(ac.summary)}` : `${name(ac.agent_key)} proposed: ${clip(ac.summary)}`,
      tone: toOwner ? 'warn' : 'info',
      request_id: ac.request_id,
      action_id: ac.id,
    })
  }
  for (const ap of store.approvals.values()) {
    const ac = store.actions.get(ap.action_id)
    if (!ac) continue
    const by = ap.decided_by_kind === 'owner' ? OWNER : 'manager'
    const verb = ap.decision === 'approve' ? 'approved' : ap.decision === 'reject' ? 'rejected' : 'asked for changes to'
    events.push({
      id: `decision:${ap.id}`,
      t: ms(ap.created_at),
      kind: 'decision',
      actor: by,
      to: by === ac.agent_key ? undefined : ac.agent_key,
      text: `${by === OWNER ? 'You' : name(by)} ${verb} ${name(ac.agent_key)}'s ${ac.action_type.startsWith('message.') ? 'message' : 'action'}: ${clip(ac.summary)}`,
      tone: ap.decision === 'approve' ? 'good' : 'warn',
      request_id: ac.request_id,
      action_id: ac.id,
    })
  }

  // Customer messages. The Website Concierge answers inside admin, so its chats are its work.
  const byConv = new Map<string, HqMessage[]>()
  for (const m of store.messages.values()) {
    const list = byConv.get(m.conversation_id) || []
    list.push(m)
    byConv.set(m.conversation_id, list)
  }
  for (const list of byConv.values()) {
    list.sort((a, b) => ms(a.created_at) - ms(b.created_at))
    list.forEach((m, i) => {
      const at = ms(m.created_at)
      const who = m.customer_name || (m.channel === 'website' ? 'A website visitor' : 'A customer')
      if (m.channel === 'website') {
        if (m.direction === 'inbound') {
          const reply = list.slice(i + 1).find((r) => r.direction === 'outbound')
          events.push({ id: `msg:${m.id}`, t: at, kind: 'inbound', actor: GATEWAY, to: CONCIERGE, text: `${who} wrote in the website chat: “${clip(m.body, 70)}”`, tone: 'info' })
          spans.push({ id: `chat:${m.id}`, node: CONCIERGE, kind: 'work', start: at, end: reply ? ms(reply.created_at) : Math.min(at + 60_000, Date.now()), label: 'answering a website visitor' })
        } else if (m.sender_kind === 'ai') {
          events.push({ id: `msg:${m.id}`, t: at, kind: 'outbound', actor: CONCIERGE, to: GATEWAY, text: `Website Concierge replied: “${clip(m.body, 70)}”`, tone: 'good' })
        }
      } else if (m.direction === 'inbound') {
        // WhatsApp and email: the reply is an action (above); the message itself is for the feed.
        events.push({ id: `msg:${m.id}`, t: at, kind: 'message', actor: GATEWAY, text: `${who} wrote on ${m.channel === 'email' ? 'email' : 'WhatsApp'}: “${clip(m.body, 70)}”`, tone: 'info' })
      }
    })
  }

  // Claude bots (they run on the owner's Claude plan, not the agent server).
  for (const bot of store.bots) {
    for (const run of bot.runs) {
      const start = ms(run.started_at)
      if (start < store.windowStart) continue
      const end = run.finished_at ? ms(run.finished_at) : null
      spans.push({ id: `bot:${run.id}`, node: botNode(bot.key), kind: 'work', start, end: run.status === 'running' ? null : end ?? start, label: bot.name })
      if (end !== null && run.status !== 'running') {
        events.push({
          id: `botrun:${run.id}`,
          t: end,
          kind: run.status === 'failed' ? 'fail' : 'bot',
          actor: botNode(bot.key),
          text: `${bot.name} ${run.status === 'failed' ? 'failed' : 'finished'}${run.summary ? `: ${clip(run.summary)}` : ''}`,
          tone: run.status === 'failed' ? 'bad' : 'good',
        })
      }
    }
  }

  events.sort((a, b) => a.t - b.t || a.id.localeCompare(b.id))
  spans.sort((a, b) => a.start - b.start)
  const byNode = new Map<NodeKey, Span[]>()
  for (const s of spans) {
    const list = byNode.get(s.node) || []
    list.push(s)
    byNode.set(s.node, list)
  }
  return { events: events.filter((e) => Number.isFinite(e.t)), spans, byNode }
}

const OWNER_VERBS: Record<string, string> = {
  'settings.changed': 'changed the AI settings',
  'playbook.changed': 'updated the playbook',
  'agent.paused': 'paused an agent',
  'agent.resumed': 'resumed an agent',
  'conversation.taken_over': 'took over a conversation',
  'conversation.handed_back': 'handed a conversation back to the AI',
  'agent.instructions_changed': "changed an agent's instructions",
}

function ownerVerb(event: string) {
  return OWNER_VERBS[event] || event.replace(/[._]/g, ' ')
}

// ---------------------------------------------------------------------------
// What each agent is doing at a moment
// ---------------------------------------------------------------------------

export type AgentState = 'offline' | 'paused' | 'idle' | 'thinking' | 'working' | 'communicating' | 'waiting' | 'completed' | 'error'

export const STATE_LABEL: Record<AgentState, string> = {
  offline: 'Offline',
  paused: 'Paused',
  idle: 'Idle',
  thinking: 'Thinking',
  working: 'Working',
  communicating: 'Talking',
  waiting: 'Needs you',
  completed: 'Done',
  error: 'Problem',
}

export type AgentView = {
  node: NodeKey
  state: AgentState
  /** What it is working on (the thinking span when it is thinking). */
  span?: Span
  /** Actions of this agent that wait for the owner right now (live view only). */
  waiting: HqAction[]
  /** The newest problem, if it has not succeeded at anything since. */
  problem?: HqEvent
}

export type StateOptions = {
  /** Live view: settings, heartbeats and pending approvals are current. Replay: only the timeline counts. */
  live: boolean
  /** The browser's "now" on the server's clock (heartbeats are compared with it). */
  now: number
  /** How many timeline ms pass per real ms (1 live; higher in Replay), so short states stay visible. */
  scale: number
}

/** How long (in real time) a hand-off keeps both robots talking, and a finish keeps one cheering. */
const TALK_MS = 3500
const DONE_MS = 6000
/** A problem stays on show until the agent succeeds again, or this long. */
const PROBLEM_MS = 30 * 60 * 1000

function covering(spans: Span[] | undefined, T: number, kind: Span['kind']): Span | undefined {
  if (!spans) return undefined
  for (let i = spans.length - 1; i >= 0; i--) {
    const s = spans[i]
    if (s.kind === kind && s.start <= T && (s.end === null || s.end >= T)) return s
  }
  return undefined
}

/** All nodes the world shows: the agents in the database, plus the Claude bots. */
export function nodeKeys(store: HqStore): NodeKey[] {
  return [...store.agents.map((a) => a.key), ...store.bots.map((b) => botNode(b.key))]
}

export function agentStatesAt(store: HqStore, tl: Timeline, T: number, opts: StateOptions): Map<NodeKey, AgentView> {
  const out = new Map<NodeKey, AgentView>()
  const talkWindow = TALK_MS * opts.scale
  const doneWindow = DONE_MS * opts.scale
  // Events up to T, newest first, scanned once per node below (the list is a day at most).
  let hi = tl.events.length
  while (hi > 0 && tl.events[hi - 1].t > T) hi--
  const past = tl.events.slice(0, hi)

  for (const node of nodeKeys(store)) {
    const agent = store.agents.find((a) => a.key === node)
    const isBot = node.startsWith('bot:')
    const waiting = opts.live
      ? [...store.actions.values()].filter((a) => a.agent_key === node && a.status === 'proposed' && a.needs_owner)
      : [...store.actions.values()].filter((a) => a.agent_key === node && waitedAt(store, a, T))
    const view: AgentView = { node, state: 'idle', waiting }

    let lastTalk = -Infinity
    let lastDone = -Infinity
    for (let i = past.length - 1; i >= 0; i--) {
      const e = past[i]
      if (e.t < T - PROBLEM_MS) break
      const mine = e.actor === node
      if (e.to && (mine || e.to === node) && e.to !== e.actor && lastTalk === -Infinity) lastTalk = e.t
      if (!mine) continue
      if (!view.problem && (e.kind === 'fail' || e.kind === 'retry') && lastDone === -Infinity) view.problem = e
      if ((e.kind === 'finish' || e.kind === 'report' || e.kind === 'outbound' || e.kind === 'bot') && lastDone === -Infinity) lastDone = e.t
    }

    const spans = tl.byNode.get(node)
    const think = covering(spans, T, 'think')
    const work = covering(spans, T, 'work')

    if (opts.live && agent && (agent.paused || (store.settings?.system_paused && node !== CONCIERGE))) view.state = 'paused'
    else if (opts.live && agent && !isBot && node !== CONCIERGE && !(agent.last_heartbeat_at && opts.now - ms(agent.last_heartbeat_at) < OFFLINE_AFTER_MS)) view.state = 'offline'
    else if (think) {
      view.state = 'thinking'
      view.span = work || think
    } else if (work) {
      view.state = 'working'
      view.span = work
    } else if (T - lastTalk <= talkWindow) view.state = 'communicating'
    else if (waiting.length) view.state = 'waiting'
    else if (view.problem) view.state = 'error'
    else if (T - lastDone <= doneWindow) view.state = 'completed'
    out.set(node, view)
  }
  return out
}

/** In Replay: was this action waiting for the owner at T? (Proposed by then, not yet decided by the owner.) */
function waitedAt(store: HqStore, a: HqAction, T: number): boolean {
  if (ms(a.created_at) > T) return false
  let decidedAt = Infinity
  let owner = false
  for (const ap of store.approvals.values()) {
    if (ap.action_id !== a.id) continue
    if (ap.decided_by_kind === 'owner') {
      owner = true
      decidedAt = Math.min(decidedAt, ms(ap.created_at))
    }
  }
  if (!owner && !(a.status === 'proposed' && a.needs_owner)) return false
  return T < decidedAt
}

/** Events between two moments (exclusive start), for spawning the pulses the playhead just passed. */
export function eventsBetween(tl: Timeline, from: number, to: number): HqEvent[] {
  const out: HqEvent[] = []
  for (const e of tl.events) {
    if (e.t > to) break
    if (e.t > from) out.push(e)
  }
  return out
}

/** Replay skips quiet stretches: the next moment anything happens after T (event or span start). */
export function nextActivityAfter(tl: Timeline, T: number): number | null {
  let best: number | null = null
  for (const e of tl.events) if (e.t > T) { best = e.t; break }
  for (const s of tl.spans) if (s.start > T) { if (best === null || s.start < best) best = s.start; break }
  return best
}

/** "Working on drafting a WhatsApp reply" style line for a robot's status. */
export function describeView(view: AgentView): string {
  if (view.state === 'thinking' || view.state === 'working') return capitalise(view.span?.label || 'working')
  if (view.state === 'waiting') return `${view.waiting.length} waiting for you`
  if (view.state === 'error') return view.problem?.text || 'Problem'
  return STATE_LABEL[view.state]
}
