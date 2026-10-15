'use client'

import { useState } from 'react'
import Link from 'next/link'
import { consoleFetch, useConsoleGet } from '@/lib/console-api'
import { formatAgo } from '@/lib/format'
import type { AiOverview, AiPendingAction } from '@/services/ai-console.service'

const LEVEL_LABEL: Record<number, string> = { 2: 'Manager or you', 3: 'Needs you' }

/** A worker that has not checked in for this long is shown as offline. */
const OFFLINE_AFTER_MS = 3 * 60 * 1000

function online(at: string | null) {
  return !!at && Date.now() - new Date(at).getTime() < OFFLINE_AFTER_MS
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

function ApprovalCard({ a, busy, onDecide }: { a: AiPendingAction; busy: boolean; onDecide: (id: string, d: 'approve' | 'reject') => void }) {
  return (
    <div className="ll-card ll-ai-approval">
      <div className="ll-row" style={{ justifyContent: 'space-between', gap: 8 }}>
        <span className={`ll-pill ${a.level === 3 ? 'new' : 'follow_up'}`}>{LEVEL_LABEL[a.level] || `Level ${a.level}`}</span>
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
      {a.reasoning && <p className="ll-small">{a.reasoning}</p>}
      <PayloadPreview payload={a.payload} />
      <div className="ll-row" style={{ marginTop: 12 }}>
        <button className="ll-btn" disabled={busy} onClick={() => onDecide(a.id, 'approve')}>
          Approve
        </button>
        <button className="ll-btn secondary" disabled={busy} onClick={() => onDecide(a.id, 'reject')}>
          Reject
        </button>
      </div>
    </div>
  )
}

export default function AiPage() {
  const { data, error, loading, reload } = useConsoleGet<{ overview?: AiOverview }>('/api/v2/ai')
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const o = data?.overview

  async function send(path: string, method: string, body: unknown) {
    setBusy(true)
    setActionError(null)
    try {
      await consoleFetch(path, { method, body: JSON.stringify(body) })
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

  function decide(id: string, decision: 'approve' | 'reject') {
    if (decision === 'reject' && !window.confirm('Reject this action? The agent will not run it.')) return
    send(`/api/v2/ai/actions/${id}`, 'POST', { decision })
  }

  const workerSeen = o?.agents.reduce<string | null>((latest, a) => (a.last_heartbeat_at && (!latest || a.last_heartbeat_at > latest) ? a.last_heartbeat_at : latest), null) ?? null
  const workerOnline = online(workerSeen)

  return (
    <div>
      <h1 className="ll-h1">AI agents</h1>
      <p className="ll-sub">Your AI General Manager and its team. Approve what needs you, and pause anything at any time.</p>
      {error && <div className="ll-error">{error}</div>}
      {actionError && <div className="ll-error">{actionError}</div>}

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
