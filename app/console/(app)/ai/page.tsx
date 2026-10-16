'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  BellRing,
  Calculator,
  Check,
  CarFront,
  Crown,
  MapPinned,
  MessagesSquare,
  Pause,
  Play,
  ShieldCheck,
  Bot,
  type LucideIcon,
} from 'lucide-react'
import { consoleFetch, useConsoleGet } from '@/lib/console-api'
import { formatAgo } from '@/lib/format'
import type { AiActivity, AiAgent, AiConversation, AiOverview, AiPendingAction, AiPing, AiRunningTask } from '@/services/ai-console.service'

/** How often the page refreshes itself while it is open and visible. */
const LIVE_REFRESH_MS = 5000

const AGENT_ICON: Record<string, LucideIcon> = {
  manager: Crown,
  sales: MessagesSquare,
  planner: MapPinned,
  pricing: Calculator,
  followup: BellRing,
  operations: CarFront,
  quality: ShieldCheck,
}

const TASK_LABEL: Record<string, string> = {
  qualify_lead: 'qualifying a new lead',
  handle_inquiry: 'drafting a WhatsApp reply',
  daily_summary: 'writing the daily summary',
  scan_follow_ups: 'checking for quiet leads',
  check_upcoming_trips: 'checking upcoming trips',
  generate_itinerary: 'drafting an itinerary',
  review_action: 'reviewing a proposed action',
  price_guide: 'working out a price guide',
  status_changed: 'checking a status change',
}

/** Verb phrases; the actor's name goes in front ("Sales finished qualifying a new lead"). */
const EVENT_LABEL: Record<string, string> = {
  'task.succeeded': 'finished',
  'task.failed': 'failed',
  'task.retry': 'will retry',
  'task.waiting': 'is waiting on',
  'action.begin': 'started an approved action',
  'action.executed': 'completed an action',
  'action.failed': 'could not complete an action',
  'action.approved': 'approved an action',
  'action.rejected': 'rejected an action',
  'settings.changed': 'changed the AI settings',
  'agent.paused': 'paused an agent',
  'agent.resumed': 'resumed an agent',
  'conversation.taken_over': 'took over a conversation',
  'conversation.handed_back': 'handed a conversation back to the AI',
  'task.rate_limit': 'hit the hourly limit for a request',
  'task.depth_limit': 'stopped a chain of tasks at the depth limit',
}

function capitalise(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function taskLabel(type: unknown) {
  const t = String(type || '')
  return TASK_LABEL[t] || readable(t)
}

function describe(e: AiActivity) {
  const base = EVENT_LABEL[e.event] || readable(e.event)
  if (e.event.startsWith('task.') && e.detail?.task_type) return `${base} ${taskLabel(e.detail.task_type)}`
  return base
}

function actorName(e: AiActivity, agents: AiAgent[]) {
  if (e.actor_kind === 'owner') return 'You'
  return agents.find((a) => a.key === e.agent_key)?.name || e.agent_key || 'System'
}

const LEVEL_LABEL: Record<number, string> = { 2: 'Manager or you', 3: 'Needs you' }

/** A worker that has not checked in for this long is shown as offline. */
const OFFLINE_AFTER_MS = 3 * 60 * 1000

function online(at: string | null) {
  return !!at && Date.now() - new Date(at).getTime() < OFFLINE_AFTER_MS
}

/** WhatsApp allows free-form replies for 24 hours after the customer's last message. */
function replyWindowOpen(until: string | null) {
  return !!until && new Date(until).getTime() > Date.now()
}

function isMessage(a: AiPendingAction) {
  return a.action_type.startsWith('message.')
}

type SendResult = { sent: number; waiting: number; failed: number; error?: string; channel?: 'email' } | null

function sendNotice(r: SendResult): string | null {
  if (!r) return null
  if (r.channel === 'email') {
    if (r.sent) return 'Sent by email from hello@lankalux.com.'
    if (r.failed) return 'Approved, but the email could not be sent. See the activity feed.'
    return 'Approved. It goes out as soon as the AI system is running and messages to customers are allowed.'
  }
  if (r.error) return `Approved. The WhatsApp sender could not be reached (${r.error}), so it will go out on the next try.`
  if (r.sent) return 'Sent on WhatsApp.'
  if (r.failed) return 'Approved, but WhatsApp did not accept it. See the conversation below.'
  return 'Approved. It goes out as soon as the AI system is running and messages to customers are allowed.'
}

function readable(type: string) {
  return type.replace(/[._]/g, ' ')
}

function PayloadPreview({ payload }: { payload: Record<string, unknown> }) {
  const entries = Object.entries(payload || {}).filter(([, v]) => v !== null && v !== '' && v !== undefined)
  if (entries.length === 0) return null
  return (
    <dl className="ll-ai-payload">
      {entries.slice(0, 12).map(([k, v]) => (
        <div key={k}>
          <dt>{readable(k)}</dt>
          <dd>{typeof v === 'string' ? v : JSON.stringify(v)}</dd>
        </div>
      ))}
    </dl>
  )
}

function ApprovalCard({
  a,
  flag,
  busy,
  onDecide,
}: {
  a: AiPendingAction
  /** Why the AI Manager or the Quality check sent it to you, if they did. */
  flag?: string
  busy: boolean
  onDecide: (id: string, d: 'approve' | 'reject', text?: string) => void
}) {
  const message = isMessage(a)
  const email = a.payload?.channel === 'email'
  const [text, setText] = useState(String(a.payload?.text ?? a.payload?.body ?? ''))
  return (
    <div className="ll-card ll-ai-approval">
      <div className="ll-row" style={{ justifyContent: 'space-between', gap: 8 }}>
        <span className={`ll-pill ${a.level === 3 || message ? 'new' : 'follow_up'}`}>
          {message ? (email ? 'Customer email' : 'Customer message') : LEVEL_LABEL[a.level] || `Level ${a.level}`}
        </span>
        <span className="ll-muted ll-small">{formatAgo(a.created_at)}</span>
      </div>
      <h3 style={{ marginTop: 10 }}>{a.summary}</h3>
      <p className="ll-muted ll-small">
        {readable(a.action_type)} · {a.agent_key}
        {a.request_id && (
          <>
            {' · '}
            <Link href={`/console/requests/${a.request_id}`}>{a.request_id}</Link>
          </>
        )}
      </p>
      {message ? (
        <>
          {typeof a.payload?.customer_said === 'string' && (
            <p className="ll-ai-bubble in">{a.payload.customer_said}</p>
          )}
          {flag && <p className="ll-ai-flag">{flag}</p>}
          {email && typeof a.payload?.subject === 'string' && (
            <p className="ll-small">
              <span className="ll-muted">Subject:</span> {a.payload.subject}
              {typeof a.payload?.to === 'string' && <span className="ll-muted"> · to {a.payload.to}</span>}
            </p>
          )}
          <label className="ll-small ll-muted" htmlFor={`reply-${a.id}`}>
            {email ? 'Email (we add “Dear name,” and the sign-off; you can edit it)' : 'Reply (you can edit it before sending)'}
          </label>
          <textarea id={`reply-${a.id}`} className="ll-ai-reply" rows={email ? 8 : 4} value={text} onChange={(e) => setText(e.target.value)} />
          {a.reasoning && <p className="ll-muted ll-small">Why: {a.reasoning}</p>}
        </>
      ) : (
        <>
          {flag && <p className="ll-ai-flag">{flag}</p>}
          {a.reasoning && <p className="ll-small">{a.reasoning}</p>}
          <PayloadPreview payload={a.payload} />
        </>
      )}
      <div className="ll-row" style={{ marginTop: 12 }}>
        <button className="ll-btn" disabled={busy || (message && !text.trim())} onClick={() => onDecide(a.id, 'approve', message ? text : undefined)}>
          {message ? (email ? 'Approve and email' : 'Approve and send') : 'Approve'}
        </button>
        <button className="ll-btn secondary" disabled={busy} onClick={() => onDecide(a.id, 'reject')}>
          Reject
        </button>
      </div>
    </div>
  )
}

function Pings({ pings, busy, onRead }: { pings: AiPing[]; busy: boolean; onRead: (ids?: string[]) => void }) {
  if (pings.length === 0) return null
  return (
    <div className="ll-card ll-panel ll-pings">
      <div className="ll-panel-head">
        <h2>The AI Manager needs you</h2>
        <button type="button" className="ll-btn small secondary" disabled={busy} onClick={() => onRead()}>
          Mark all seen
        </button>
      </div>
      <ul>
        {pings.map((p) => (
          <li key={p.id} className={p.kind}>
            <div>
              <strong>{p.title}</strong>
              {p.body && <p>{p.body}</p>}
              <small>
                {formatAgo(p.created_at)}
                {p.request_id && (
                  <>
                    {' · '}
                    <Link href={`/console/requests/${p.request_id}`}>{p.request_id}</Link>
                  </>
                )}
              </small>
            </div>
            <button type="button" className="ll-icon-btn" disabled={busy} aria-label="Mark seen" title="Mark seen" onClick={() => onRead([p.id])}>
              <Check size={15} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function ConversationCard({ c, busy, onMode }: { c: AiConversation; busy: boolean; onMode: (id: string, mode: 'ai' | 'human') => void }) {
  const windowOpen = replyWindowOpen(c.service_window_expires_at)
  return (
    <div className="ll-card ll-ai-conversation">
      <div className="ll-row" style={{ justifyContent: 'space-between', gap: 8 }}>
        <div>
          <h3>{c.customer_name || `+${c.external_id}`}</h3>
          <p className="ll-muted ll-small">
            +{c.external_id} · {c.last_message_at ? formatAgo(c.last_message_at) : 'no messages'}
            {!windowOpen && ' · reply window closed'}
          </p>
        </div>
        <div className="ll-row" style={{ gap: 8 }}>
          <span className={`ll-pill ${c.mode === 'ai' ? 'follow_up' : 'expired'}`}>{c.mode === 'ai' ? 'AI' : 'You'}</span>
          <button className="ll-btn secondary" disabled={busy} onClick={() => onMode(c.id, c.mode === 'ai' ? 'human' : 'ai')}>
            {c.mode === 'ai' ? 'Take over' : 'Hand back to AI'}
          </button>
        </div>
      </div>
      <div className="ll-ai-thread">
        {c.messages.map((m, i) => (
          <p key={i} className={`ll-ai-bubble ${m.direction === 'inbound' ? 'in' : 'out'}`}>
            {m.body}
            <span className="ll-ai-meta">
              {formatAgo(m.created_at)}
              {m.direction === 'outbound' && ` · ${m.status}`}
            </span>
          </p>
        ))}
      </div>
    </div>
  )
}

type AgentState = 'working' | 'idle' | 'paused' | 'offline'

function agentState(ag: AiAgent, o: AiOverview, task: AiRunningTask | undefined): AgentState {
  if (ag.paused || o.settings.system_paused) return 'paused'
  if (!online(ag.last_heartbeat_at)) return 'offline'
  return task ? 'working' : 'idle'
}

const STATE_LABEL: Record<AgentState, string> = { working: 'Working', idle: 'Idle', paused: 'Paused', offline: 'Offline' }

function AgentCard({ ag, o, busy, onToggle }: { ag: AiAgent; o: AiOverview; busy: boolean; onToggle: () => void }) {
  const task = o.running.find((t) => t.agent_key === ag.key)
  const state = agentState(ag, o, task)
  const last = o.activity.find((e) => e.agent_key === ag.key && e.actor_kind !== 'owner')
  const Icon = AGENT_ICON[ag.key] || Bot
  return (
    <div className={`ll-agent ${state} ${ag.key === 'manager' ? 'lead' : ''}`}>
      <div className="ll-agent-top">
        <span className="ll-agent-icon" aria-hidden>
          <Icon size={18} strokeWidth={1.75} />
        </span>
        <div className="ll-agent-name">
          <strong>{ag.name}</strong>
          <span className={`ll-agent-state ${state}`}>{STATE_LABEL[state]}</span>
        </div>
        <button
          type="button"
          className="ll-icon-btn"
          disabled={busy}
          aria-label={ag.paused ? `Resume ${ag.name}` : `Pause ${ag.name}`}
          title={ag.paused ? 'Resume this agent' : 'Pause this agent'}
          onClick={onToggle}
        >
          {ag.paused ? <Play size={15} /> : <Pause size={15} />}
        </button>
      </div>
      <p className="ll-agent-now">
        {state === 'working' && task ? (
          <>
            Now {taskLabel(task.task_type)}
            {task.request_id && <span className="ll-muted"> · {task.request_id}</span>}
            <span className="ll-dots" aria-hidden>
              <i />
              <i />
              <i />
            </span>
          </>
        ) : last ? (
          <span className="ll-muted">
            {capitalise(describe(last))} · {formatAgo(last.created_at)}
          </span>
        ) : (
          <span className="ll-muted">{ag.description}</span>
        )}
      </p>
      {ag.last_error && <p className="ll-agent-error">Last error: {ag.last_error}</p>}
    </div>
  )
}

function secondsSince(at: number | null) {
  return at ? Math.max(0, Math.round((Date.now() - at) / 1000)) : null
}

type Tab = 'live' | 'approvals' | 'whatsapp'

export default function AiPage() {
  const { data, error, loading, reload, refreshing } = useConsoleGet<{ overview?: AiOverview }>('/api/v2/ai')
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('live')
  const [updatedAt, setUpdatedAt] = useState<number | null>(null)
  const [, setTick] = useState(0)
  const o = data?.overview

  // Live view: refresh every few seconds while the tab is visible.
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') {
        reload()
          .then(() => setUpdatedAt(Date.now()))
          .catch(() => {})
      }
      setTick((t) => t + 1)
    }, LIVE_REFRESH_MS)
    return () => clearInterval(id)
  }, [reload])

  async function send(path: string, method: string, body: unknown) {
    setBusy(true)
    setActionError(null)
    setNotice(null)
    try {
      const res = await consoleFetch(path, { method, body: JSON.stringify(body) })
      setNotice(sendNotice((res as { send?: SendResult }).send ?? null))
      await reload()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  function togglePause() {
    if (!o) return
    const resume = o.settings.system_paused
    const msg = resume
      ? 'Start the AI system? Agents will begin working on CRM events (internal work only unless customer messages are also allowed).'
      : 'Pause the whole AI system? Agents stop picking up work and nothing new runs.'
    if (window.confirm(msg)) send('/api/v2/ai', 'PATCH', { system_paused: !resume })
  }

  function toggleMessaging() {
    if (!o) return
    const enable = !o.settings.customer_messaging_enabled
    const msg = enable
      ? o.settings.owner_approves_messages
        ? 'Allow the AI to send messages to customers? Every message still needs your approval, and you can take over any conversation.'
        : 'Allow the AI to send messages to customers? The AI Manager approves routine ones and sends you the rest. You can take over any conversation.'
      : 'Stop all AI messages to customers?'
    if (window.confirm(msg)) send('/api/v2/ai', 'PATCH', { customer_messaging_enabled: enable })
  }

  function setApprover(owner: boolean) {
    if (!o || o.settings.owner_approves_messages === owner) return
    const msg = owner
      ? 'Approve every customer message yourself again?'
      : 'Let the AI Manager approve routine customer messages? It sends you anything unusual, and only you can approve prices, discounts, bookings and payments. You can switch back at any time.'
    if (window.confirm(msg)) send('/api/v2/ai', 'PATCH', { owner_approves_messages: owner })
  }

  function decide(id: string, decision: 'approve' | 'reject', text?: string) {
    if (decision === 'reject' && !window.confirm('Reject this action? The agent will not run it.')) return
    send(`/api/v2/ai/actions/${id}`, 'POST', { decision, text })
  }

  function setMode(id: string, mode: 'ai' | 'human') {
    const msg =
      mode === 'human'
        ? 'Take over this conversation? The AI stops replying to this customer and its unsent drafts are withdrawn.'
        : 'Hand this conversation back to the AI? It will draft replies again (each still needs your approval).'
    if (window.confirm(msg)) send(`/api/v2/ai/conversations/${id}`, 'PATCH', { mode })
  }

  const workerSeen = o?.agents.reduce<string | null>((latest, a) => (a.last_heartbeat_at && (!latest || a.last_heartbeat_at > latest) ? a.last_heartbeat_at : latest), null) ?? null
  const workerOnline = online(workerSeen)
  const agents = useMemo(() => {
    const list = [...(o?.agents || [])]
    return list.sort((a, b) => (a.key === 'manager' ? -1 : b.key === 'manager' ? 1 : 0))
  }, [o])
  const live = !!o && !o.settings.system_paused && workerOnline
  const secondsAgo = secondsSince(updatedAt)

  return (
    <div className="ll-airoom">
      <div className="ll-page-head">
        <div>
          <h1 className="ll-h1">AI control room</h1>
          <p className="ll-sub">
            <span className={`ll-live ${live ? 'on' : ''}`}>{live ? 'Live' : o?.settings.system_paused ? 'Paused' : 'Server offline'}</span>
            <span className="ll-muted"> · {secondsAgo === null || secondsAgo < 3 || refreshing ? 'updated just now' : `updated ${secondsAgo}s ago`} · refreshes every {LIVE_REFRESH_MS / 1000}s</span>
          </p>
        </div>
        {o && (
          <div className="ll-row" style={{ gap: 8 }}>
            <button className={`ll-btn small secondary`} disabled={busy} onClick={toggleMessaging}>
              {o.settings.customer_messaging_enabled ? 'Stop customer messages' : 'Allow customer messages'}
            </button>
            <button className={`ll-btn small ${o.settings.system_paused ? '' : 'danger'}`} disabled={busy} onClick={togglePause}>
              {o.settings.system_paused ? (
                <>
                  <Play size={15} aria-hidden /> Start
                </>
              ) : (
                <>
                  <Pause size={15} aria-hidden /> Pause everything
                </>
              )}
            </button>
          </div>
        )}
      </div>
      {error && <div className="ll-error">{error}</div>}
      {actionError && <div className="ll-error">{actionError}</div>}
      {notice && <div className="ll-ok">{notice}</div>}

      <div className="ll-statbar">
        <div>
          <span>AI system</span>
          <strong>{loading ? '…' : o?.settings.system_paused ? 'Paused' : 'Running'}</strong>
        </div>
        <div>
          <span>Customer messages</span>
          <strong>{loading ? '…' : o?.settings.customer_messaging_enabled ? 'Allowed' : 'Off'}</strong>
        </div>
        <div>
          <span>Approves messages</span>
          <div className="ll-seg ll-seg-sm" role="group" aria-label="Who approves customer messages">
            <button type="button" className={o?.settings.owner_approves_messages ? 'on' : ''} disabled={!o || busy} onClick={() => setApprover(true)}>
              You
            </button>
            <button type="button" className={o && !o.settings.owner_approves_messages ? 'on' : ''} disabled={!o || busy} onClick={() => setApprover(false)}>
              AI Manager
            </button>
          </div>
        </div>
        <div>
          <span>Server</span>
          <strong>{loading ? '…' : workerOnline ? 'Online' : 'Offline'}</strong>
          <small>{workerSeen ? `seen ${formatAgo(workerSeen)}` : 'not started yet'}</small>
        </div>
        <div>
          <span>Working now</span>
          <strong>{o ? o.counts.running : '…'}</strong>
          <small>{o ? `${o.counts.queued} queued` : ''}</small>
        </div>
        <div>
          <span>Today</span>
          <strong>{o ? o.counts.executed_today : '…'}</strong>
          <small>{o ? `done · ${o.counts.failed_today} failed` : ''}</small>
        </div>
      </div>

      <div className="ll-seg ll-room-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'live'} className={tab === 'live' ? 'on' : ''} onClick={() => setTab('live')}>
          Live
        </button>
        <button type="button" role="tab" aria-selected={tab === 'approvals'} className={tab === 'approvals' ? 'on' : ''} onClick={() => setTab('approvals')}>
          Approvals{o && o.pending.length > 0 && <span className="ll-count">{o.pending.length}</span>}
        </button>
        <button type="button" role="tab" aria-selected={tab === 'whatsapp'} className={tab === 'whatsapp' ? 'on' : ''} onClick={() => setTab('whatsapp')}>
          WhatsApp{o && o.conversations.length > 0 && <span className="ll-count">{o.conversations.length}</span>}
        </button>
      </div>

      {tab === 'live' && (
        <div className="ll-room">
          <section>
            {o && <Pings pings={o.pings} busy={busy} onRead={(ids) => send('/api/v2/ai/pings', 'POST', ids ? { ids } : {})} />}
            <div className="ll-agents">
              {!o
                ? Array.from({ length: 7 }, (_, i) => <div key={i} className="ll-agent ll-agent-skel" />)
                : agents.map((ag) => (
                    <AgentCard key={ag.key} ag={ag} o={o} busy={busy} onToggle={() => send(`/api/v2/ai/agents/${ag.key}`, 'PATCH', { paused: !ag.paused })} />
                  ))}
            </div>
            {o?.summary && (
              <div className="ll-card ll-panel" style={{ marginTop: 16 }}>
                <div className="ll-panel-head">
                  <h2>Daily summary</h2>
                  <span className="ll-muted ll-small">{o.summary.day}</span>
                </div>
                <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{o.summary.summary}</p>
              </div>
            )}
          </section>
          <section className="ll-card ll-panel ll-feed">
            <div className="ll-panel-head">
              <h2>Activity</h2>
              <span className={`ll-live ${live ? 'on' : ''}`}>{live ? 'Live' : 'Idle'}</span>
            </div>
            {!o || o.activity.length === 0 ? (
              <p className="ll-empty">No activity yet. When the agents start working, every step shows up here.</p>
            ) : (
              <ol>
                {o.activity.map((e) => (
                  <li key={e.id} className={e.event.endsWith('failed') ? 'bad' : e.actor_kind === 'owner' ? 'you' : ''}>
                    <span className="ll-feed-dot" aria-hidden />
                    <div>
                      <p>
                        <strong>{actorName(e, o.agents)}</strong> {describe(e)}
                        {e.request_id && (
                          <>
                            {' · '}
                            <Link href={`/console/requests/${e.request_id}`}>{e.request_id}</Link>
                          </>
                        )}
                      </p>
                      <small>{formatAgo(e.created_at)}</small>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      )}

      {tab === 'approvals' && (
        <section>
          <p className="ll-muted ll-small" style={{ margin: '0 0 12px' }}>
            Approving lets the agent go ahead. The database checks your approval again before anything runs.
          </p>
          {!o ? (
            <p className="ll-muted">Loading…</p>
          ) : o.pending.length === 0 ? (
            <div className="ll-card">
              <p className="ll-empty">Nothing is waiting for you.</p>
            </div>
          ) : (
            <div className="ll-ai-list">
              {o.pending.map((a) => (
                <ApprovalCard key={a.id} a={a} flag={o.pings.find((p) => p.action_id === a.id && p.kind === 'approval_needed')?.body} busy={busy} onDecide={decide} />
              ))}
            </div>
          )}
        </section>
      )}

      {tab === 'whatsapp' && (
        <section>
          <p className="ll-muted ll-small" style={{ margin: '0 0 12px' }}>
            Take over a conversation to stop the AI replying to that customer.
          </p>
          {!o || o.conversations.length === 0 ? (
            <div className="ll-card">
              <p className="ll-empty">No conversations yet.</p>
            </div>
          ) : (
            <div className="ll-ai-list ll-convs">
              {o.conversations.map((c) => (
                <ConversationCard key={c.id} c={c} busy={busy} onMode={setMode} />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
