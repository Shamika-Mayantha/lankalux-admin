'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { ExternalLink, Pause, Play, X } from 'lucide-react'
import { formatAgo } from '@/lib/format'
import { taskLabel } from '@/features/console/ai-labels'
import { ApprovalCard } from '@/features/console/AiApprovalCard'
import { botNode, CONCIERGE, GATEWAY, OWNER, STATE_LABEL, shortName, type AgentView, type HqStore, type NodeKey, type Timeline } from '@/features/hq/engine'
import { ago, clock } from '@/features/hq/format'
import { ACCENT, BOT_LOOK, type Plot } from '@/features/hq/layout'
import type { HqAction, HqMessage, HqTask } from '@/services/ai-hq.service'

/**
 * The glass panel for whatever you clicked: an agent, a Claude bot, your balcony or the gateway.
 * Everything in it is read from the agent tables; approving here uses the same endpoint (and the
 * same database check) as the Approvals tab.
 */

type Props = {
  node: NodeKey
  name: string
  plot: Plot
  store: HqStore
  timeline: Timeline
  view: AgentView | undefined
  playhead: number
  busy: boolean
  pending: HqAction[]
  onDecide: (id: string, d: 'approve' | 'reject', text?: string) => void
  onPause: (key: string, paused: boolean) => void
  onSelect: (n: NodeKey) => void
  onClose: () => void
  isGateway: boolean
}

const STATUS_TONE: Record<HqTask['status'], string> = {
  queued: 'info',
  running: 'info',
  waiting: 'warn',
  succeeded: 'good',
  failed: 'bad',
  cancelled: 'muted',
}

export function HqPanel(p: Props) {
  const { node, store, timeline, view, playhead } = p
  const isBot = node.startsWith('bot:')
  const bot = isBot ? store.bots.find((b) => botNode(b.key) === node) : undefined
  const agent = store.agents.find((a) => a.key === node)
  const accent = isBot ? BOT_LOOK.accent : p.plot.robot?.accent ?? (node === OWNER ? ACCENT.amber : ACCENT.cyan)
  const state = view?.state ?? 'idle'

  const talks = useMemo(
    () => timeline.events.filter((e) => e.to && e.to !== e.actor && (e.actor === node || e.to === node) && e.t <= playhead).slice(-10).reverse(),
    [timeline, node, playhead]
  )
  const events = useMemo(() => timeline.events.filter((e) => (e.actor === node || e.to === node) && e.t <= playhead).slice(-14).reverse(), [timeline, node, playhead])
  const tasks = useMemo(
    () => [...store.tasks.values()].filter((t) => t.agent_key === node).sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at)).slice(0, 12),
    [store.tasks, node]
  )
  const problems = useMemo(
    () => timeline.events.filter((e) => e.actor === node && (e.kind === 'fail' || e.kind === 'retry') && e.t <= playhead).slice(-5).reverse(),
    [timeline, node, playhead]
  )
  const messages = useMemo(() => messagesFor(store, node), [store, node])
  const seconds = (t: HqTask) => {
    for (const a of store.activity.values()) if (a.task_id === t.id && typeof a.detail?.seconds === 'number') return a.detail.seconds as number
    return null
  }

  return (
    <aside className="hq-panel hq-glass" aria-label={`${p.name} details`} style={{ ['--hq-accent' as string]: accent }}>
      <header className="hq-panel-head">
        <span className="hq-avatar" aria-hidden />
        <div>
          <p className="hq-eyebrow">{isBot ? 'Claude annex' : p.plot.title}</p>
          <h2>{p.name}</h2>
          {node !== OWNER && node !== GATEWAY && (
            <span className={`hq-state s-${state}`}>
              <i aria-hidden /> {STATE_LABEL[state]}
            </span>
          )}
        </div>
        <div className="hq-panel-actions">
          {agent && (
            <button
              type="button"
              className="hq-x"
              disabled={p.busy}
              title={agent.paused ? 'Resume this agent' : 'Pause this agent'}
              aria-label={agent.paused ? `Resume ${p.name}` : `Pause ${p.name}`}
              onClick={() => p.onPause(agent.key, !agent.paused)}
            >
              {agent.paused ? <Play size={15} /> : <Pause size={15} />}
            </button>
          )}
          <button type="button" className="hq-x" onClick={p.onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
      </header>

      <div className="hq-panel-body">
        <p className="hq-role">{bot ? bot.does : p.plot.role || agent?.description}</p>
        {bot && <p className="hq-muted hq-small">Runs {bot.schedule.charAt(0).toLowerCase() + bot.schedule.slice(1)}.</p>}
        {agent?.model && node !== CONCIERGE && <p className="hq-muted hq-small">Model: {agent.model} on the LankaLux agent server.</p>}

        {/* Right now */}
        {node !== OWNER && node !== GATEWAY && (
          <section>
            <h3>Right now</h3>
            {view?.span && (state === 'working' || state === 'thinking') ? (
              <div className="hq-now">
                <strong>{capital(view.span.label)}</strong>
                <span className="hq-muted">
                  for {ago(playhead - view.span.start)}
                  {state === 'thinking' && ' · waiting on the model'}
                  {view.span.request_id && (
                    <>
                      {' · '}
                      <Link href={`/console/requests/${view.span.request_id}`}>{view.span.request_id}</Link>
                    </>
                  )}
                </span>
              </div>
            ) : (
              <p className="hq-muted">{nowLine(state, agent?.last_heartbeat_at ?? null)}</p>
            )}
          </section>
        )}

        {/* Approvals */}
        {(node === OWNER || p.pending.length > 0) && (
          <section>
            <h3>
              Needs you {p.pending.length > 0 && <b className="hq-count">{p.pending.length}</b>}
            </h3>
            {p.pending.length === 0 ? (
              <p className="hq-muted">Nothing is waiting for you.</p>
            ) : (
              <div className="hq-approvals">
                {p.pending.map((a) => (
                  <div key={a.id}>
                    {node === OWNER && (
                      <button type="button" className="hq-link" onClick={() => p.onSelect(a.agent_key)}>
                        From {shortName(store, a.agent_key)}
                      </button>
                    )}
                    <ApprovalCard a={a} flag={store.pings.find((x) => x.action_id === a.id && x.kind === 'approval_needed')?.body} busy={p.busy} onDecide={p.onDecide} />
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
        {node === OWNER && store.pings.length > 0 && (
          <section>
            <h3>From the AI Manager</h3>
            <ul className="hq-list">
              {store.pings.map((x) => (
                <li key={x.id} className={x.kind === 'error' ? 't-bad' : 't-warn'}>
                  <strong>{x.title}</strong>
                  {x.body && <span>{x.body}</span>}
                  <small>{formatAgo(x.created_at)}</small>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Problems */}
        {(problems.length > 0 || agent?.last_error) && (
          <section>
            <h3>Problems</h3>
            <ul className="hq-list">
              {agent?.last_error && (
                <li className="t-bad">
                  <strong>Last error reported by the agent</strong>
                  <span>{agent.last_error}</span>
                </li>
              )}
              {problems.map((e) => (
                <li key={e.id} className="t-bad">
                  <span>{e.text}</span>
                  <small>{clock(e.t)}</small>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Conversations with other agents */}
        {talks.length > 0 && (
          <section>
            <h3>Talking with</h3>
            <ul className="hq-list">
              {talks.map((e) => {
                const other = e.actor === node ? e.to! : e.actor
                return (
                  <li key={e.id}>
                    <button type="button" className="hq-link" onClick={() => p.onSelect(other)}>
                      {e.actor === node ? '→' : '←'} {shortName(store, other)}
                    </button>
                    <span>{e.text}</span>
                    <small>
                      {clock(e.t)}
                      {e.request_id && (
                        <>
                          {' · '}
                          <Link href={`/console/requests/${e.request_id}`}>{e.request_id}</Link>
                        </>
                      )}
                    </small>
                  </li>
                )
              })}
            </ul>
          </section>
        )}

        {/* Customer messages */}
        {messages.length > 0 && (
          <section>
            <h3>Messages</h3>
            <div className="hq-thread">
              {messages.map((m) => (
                <p key={m.id} className={`hq-bubble ${m.direction === 'inbound' ? 'in' : 'out'}`}>
                  <span className="hq-muted hq-small">
                    {m.direction === 'inbound' ? m.customer_name || (m.channel === 'website' ? 'Website visitor' : 'Customer') : 'LankaLux'} · {m.channel} · {formatAgo(m.created_at)}
                  </span>
                  {m.body}
                </p>
              ))}
            </div>
          </section>
        )}

        {/* Task history */}
        {tasks.length > 0 && (
          <section>
            <h3>Task history (24 h)</h3>
            <ul className="hq-tasks">
              {tasks.map((t) => {
                const took = seconds(t)
                return (
                  <li key={t.id}>
                    <span className={`hq-dot ${STATUS_TONE[t.status]}`} />
                    <span>
                      {capital(taskLabel(t.task_type))}
                      <small>
                        {t.status}
                        {took !== null && ` · ${took < 1 ? '<1s' : ago(took * 1000)}`} · {formatAgo(t.finished_at || t.updated_at)}
                        {t.request_id && (
                          <>
                            {' · '}
                            <Link href={`/console/requests/${t.request_id}`}>{t.request_id}</Link>
                          </>
                        )}
                      </small>
                      {t.error && <small className="t-bad">{t.error}</small>}
                    </span>
                  </li>
                )
              })}
            </ul>
          </section>
        )}

        {/* Claude bot runs */}
        {bot && (
          <section>
            <h3>Recent runs</h3>
            {bot.runs.length === 0 ? (
              <p className="hq-muted">No runs recorded yet.</p>
            ) : (
              <ul className="hq-list">
                {bot.runs.map((r) => (
                  <li key={r.id} className={r.status === 'failed' ? 't-bad' : ''}>
                    <strong>
                      {r.status === 'running' ? 'Running' : r.status === 'failed' ? 'Failed' : 'Finished'} · {formatAgo(r.finished_at || r.started_at)}
                    </strong>
                    {r.summary && <span>{r.summary}</span>}
                    {r.links.map((l) => (
                      <a key={l.url} href={l.url} target="_blank" rel="noreferrer">
                        {l.title} <ExternalLink size={12} aria-hidden />
                      </a>
                    ))}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {/* Everything else */}
        {(p.isGateway || (!talks.length && !tasks.length && !bot)) && (
          <section>
            <h3>Recent activity</h3>
            {events.length === 0 ? (
              <p className="hq-muted">Nothing in the last 24 hours.</p>
            ) : (
              <ul className="hq-list">
                {events.map((e) => (
                  <li key={e.id} className={`t-${e.tone}`}>
                    <span>{e.text}</span>
                    <small>{clock(e.t)}</small>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </aside>
  )
}

function capital(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function nowLine(state: AgentView['state'], heartbeat: string | null): string {
  switch (state) {
    case 'paused':
      return 'Paused. It picks up no new work until it is resumed.'
    case 'offline':
      return `The agent server has not checked in${heartbeat ? ` since ${formatAgo(heartbeat)}` : ''}.`
    case 'waiting':
      return 'Waiting for your decision.'
    case 'communicating':
      return 'Handing work over.'
    case 'completed':
      return 'Just finished a task.'
    case 'error':
      return 'Its last task ran into a problem (see below).'
    default:
      return 'On duty and ready. It starts a job as soon as a message, a schedule or another agent gives it one. Until then it keeps tidy at its station (that movement is not a job).'
  }
}

/** Customer messages this agent wrote (through its actions), or the website chats for the concierge. */
function messagesFor(store: HqStore, node: NodeKey): HqMessage[] {
  const all = [...store.messages.values()]
  let mine: HqMessage[]
  if (node === CONCIERGE) mine = all.filter((m) => m.channel === 'website')
  else if (node === GATEWAY) mine = all.filter((m) => m.direction === 'inbound')
  else {
    const actions = new Set([...store.actions.values()].filter((a) => a.agent_key === node).map((a) => a.id))
    const convs = new Set(all.filter((m) => m.agent_key === node || (m.action_id && actions.has(m.action_id))).map((m) => m.conversation_id))
    mine = all.filter((m) => convs.has(m.conversation_id))
  }
  return mine.sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at)).slice(-8)
}
