'use client'

import { useState } from 'react'
import Link from 'next/link'
import { consoleFetch, useConsoleGet } from '@/lib/console-api'
import { formatAgo } from '@/lib/format'
import type { AiConversation, AiOverview, AiPendingAction } from '@/services/ai-console.service'

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

type SendResult = { sent: number; waiting: number; failed: number; error?: string } | null

function sendNotice(r: SendResult): string | null {
  if (!r) return null
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
  busy,
  onDecide,
}: {
  a: AiPendingAction
  busy: boolean
  onDecide: (id: string, d: 'approve' | 'reject', text?: string) => void
}) {
  const message = isMessage(a)
  const [text, setText] = useState(String(a.payload?.text ?? ''))
  return (
    <div className="ll-card ll-ai-approval">
      <div className="ll-row" style={{ justifyContent: 'space-between', gap: 8 }}>
        <span className={`ll-pill ${a.level === 3 || message ? 'new' : 'follow_up'}`}>{message ? 'Customer message' : LEVEL_LABEL[a.level] || `Level ${a.level}`}</span>
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
          <label className="ll-small ll-muted" htmlFor={`reply-${a.id}`}>
            Reply (you can edit it before sending)
          </label>
          <textarea id={`reply-${a.id}`} className="ll-ai-reply" rows={4} value={text} onChange={(e) => setText(e.target.value)} />
          {a.reasoning && <p className="ll-muted ll-small">Why: {a.reasoning}</p>}
        </>
      ) : (
        <>
          {a.reasoning && <p className="ll-small">{a.reasoning}</p>}
          <PayloadPreview payload={a.payload} />
        </>
      )}
      <div className="ll-row" style={{ marginTop: 12 }}>
        <button className="ll-btn" disabled={busy || (message && !text.trim())} onClick={() => onDecide(a.id, 'approve', message ? text : undefined)}>
          {message ? 'Approve and send' : 'Approve'}
        </button>
        <button className="ll-btn secondary" disabled={busy} onClick={() => onDecide(a.id, 'reject')}>
          Reject
        </button>
      </div>
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

export default function AiPage() {
  const { data, error, loading, reload } = useConsoleGet<{ overview?: AiOverview }>('/api/v2/ai')
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const o = data?.overview

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
      ? 'Start the AI system? Agents will begin working on CRM events (internal work only unless customer messaging is also on).'
      : 'Pause the whole AI system? Agents stop picking up work and nothing new runs.'
    if (window.confirm(msg)) send('/api/v2/ai', 'PATCH', { system_paused: !resume })
  }

  function toggleMessaging() {
    if (!o) return
    const enable = !o.settings.customer_messaging_enabled
    const msg = enable
      ? 'Allow the AI to send messages to customers? Every message still follows the approval levels, and you can take over any conversation.'
      : 'Stop all AI messages to customers?'
    if (window.confirm(msg)) send('/api/v2/ai', 'PATCH', { customer_messaging_enabled: enable })
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

  return (
    <div>
      <h1 className="ll-h1">AI agents</h1>
      <p className="ll-sub">Your AI General Manager and its team. Approve what needs you, and pause anything at any time.</p>
      {error && <div className="ll-error">{error}</div>}
      {actionError && <div className="ll-error">{actionError}</div>}
      {notice && <div className="ll-ok">{notice}</div>}

      <div className="ll-grid">
        <div className="ll-card">
          <h3>AI system</h3>
          <p className="ll-stat">{loading ? <span className="ll-skel ll-skel-stat" /> : o?.settings.system_paused ? 'Paused' : 'Running'}</p>
          {o && (
            <button className={`ll-btn ${o.settings.system_paused ? '' : 'danger'}`} disabled={busy} onClick={togglePause}>
              {o.settings.system_paused ? 'Start' : 'Pause everything'}
            </button>
          )}
        </div>
        <div className="ll-card">
          <h3>Messages to customers</h3>
          <p className="ll-stat">{loading ? <span className="ll-skel ll-skel-stat" /> : o?.settings.customer_messaging_enabled ? 'Allowed' : 'Off'}</p>
          {o && (
            <button className={`ll-btn ${o.settings.customer_messaging_enabled ? 'danger' : 'secondary'}`} disabled={busy} onClick={toggleMessaging}>
              {o.settings.customer_messaging_enabled ? 'Turn off' : 'Allow'}
            </button>
          )}
        </div>
        <div className="ll-card">
          <h3>Server</h3>
          <p className="ll-stat">{loading ? <span className="ll-skel ll-skel-stat" /> : workerOnline ? 'Online' : 'Offline'}</p>
          <span className="ll-muted ll-small">{workerSeen ? `Last seen ${formatAgo(workerSeen)}` : 'Not started yet'}</span>
        </div>
        <div className="ll-card">
          <h3>Waiting for you</h3>
          <p className="ll-stat">{loading ? <span className="ll-skel ll-skel-stat" /> : o?.pending.length}</p>
          {o && (
            <span className="ll-muted ll-small">
              {o.counts.queued} queued · {o.counts.executed_today} done today · {o.counts.failed_today} failed today
            </span>
          )}
        </div>
      </div>

      <section className="ll-category">
        <div className="ll-category-head">
          <h2>Approvals</h2>
          <span className="ll-muted">Approving lets the agent go ahead; the database checks your approval again before anything runs.</span>
        </div>
        {!o ? (
          <p className="ll-muted">Loading…</p>
        ) : o.pending.length === 0 ? (
          <div className="ll-card">
            <p className="ll-muted">Nothing is waiting for you.</p>
          </div>
        ) : (
          <div className="ll-ai-list">
            {o.pending.map((a) => (
              <ApprovalCard key={a.id} a={a} busy={busy} onDecide={decide} />
            ))}
          </div>
        )}
      </section>

      <section className="ll-category">
        <div className="ll-category-head">
          <h2>WhatsApp conversations</h2>
          <span className="ll-muted">Take over a conversation to stop the AI replying to that customer.</span>
        </div>
        {!o || o.conversations.length === 0 ? (
          <div className="ll-card">
            <p className="ll-muted">No conversations yet.</p>
          </div>
        ) : (
          <div className="ll-ai-list">
            {o.conversations.map((c) => (
              <ConversationCard key={c.id} c={c} busy={busy} onMode={setMode} />
            ))}
          </div>
        )}
      </section>

      {o?.summary && (
        <section className="ll-category">
          <div className="ll-category-head">
            <h2>Daily summary</h2>
            <span className="ll-muted">{o.summary.day}</span>
          </div>
          <div className="ll-card">
            <p style={{ whiteSpace: 'pre-wrap' }}>{o.summary.summary}</p>
          </div>
        </section>
      )}

      <section className="ll-category">
        <div className="ll-category-head">
          <h2>Agents</h2>
          <span className="ll-muted">A paused agent picks up no new work.</span>
        </div>
        <div className="ll-ai-list">
          {(o?.agents || []).map((ag) => (
            <div className="ll-card ll-ai-agent" key={ag.key}>
              <div>
                <h3>
                  {ag.name} {ag.paused && <span className="ll-pill expired">Paused</span>}
                </h3>
                <p className="ll-muted ll-small">{ag.description}</p>
                {ag.last_error && <p className="ll-small" style={{ color: 'var(--error-text)' }}>Last error: {ag.last_error}</p>}
              </div>
              <button className="ll-btn secondary" disabled={busy} onClick={() => send(`/api/v2/ai/agents/${ag.key}`, 'PATCH', { paused: !ag.paused })}>
                {ag.paused ? 'Resume' : 'Pause'}
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="ll-category">
        <div className="ll-category-head">
          <h2>Recent activity</h2>
        </div>
        <div className="ll-card">
          {!o || o.activity.length === 0 ? (
            <p className="ll-muted">No activity yet.</p>
          ) : (
            <ul className="ll-ai-activity">
              {o.activity.map((e) => (
                <li key={e.id}>
                  <span className="ll-muted ll-small">{formatAgo(e.created_at)}</span>
                  <span>
                    {e.actor_kind === 'owner' ? 'You' : e.agent_key || e.actor_kind} · {readable(e.event)}
                    {e.request_id && <span className="ll-muted"> · {e.request_id}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  )
}
