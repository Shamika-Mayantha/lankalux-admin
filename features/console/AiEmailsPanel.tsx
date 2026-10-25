'use client'

import { useState } from 'react'
import Link from 'next/link'
import { consoleFetch, useConsoleGet } from '@/lib/console-api'
import { formatAgo } from '@/lib/format'
import type { AiEmail } from '@/services/ai-leads.service'
import type { AiAgent } from '@/services/ai-console.service'
import type { OptOut } from '@/services/unsubscribe.service'

type Filter = 'all' | 'waiting' | 'sent' | 'stopped'

const STATE: Record<AiEmail['state'], { label: string; pill: string }> = {
  waiting: { label: 'Waiting', pill: 'follow_up' },
  sending: { label: 'Sending', pill: 'new' },
  sent: { label: 'Sent', pill: 'sold' },
  rejected: { label: 'Rejected', pill: 'cancelled' },
  failed: { label: 'Failed', pill: 'cancelled' },
  withdrawn: { label: 'Withdrawn', pill: 'expired' },
}

function matches(e: AiEmail, f: Filter) {
  if (f === 'all') return true
  if (f === 'waiting') return e.state === 'waiting' || e.state === 'sending'
  if (f === 'sent') return e.state === 'sent'
  return e.state === 'rejected' || e.state === 'failed' || e.state === 'withdrawn'
}

function decidedLine(e: AiEmail) {
  if (!e.decided_by) return e.state === 'waiting' ? 'Not reviewed yet' : null
  const who = e.decided_by === 'owner' ? 'you' : 'the AI Manager'
  if (e.state === 'rejected') return `Rejected by ${who}`
  if (e.state === 'withdrawn') return null
  return `Approved by ${who}${e.edited ? ' (you edited it)' : ''}`
}

/** People the AI never emails again: they clicked Unsubscribe, or the owner added them. */
function DoNotEmail() {
  const { data, error, reload } = useConsoleGet<{ optouts?: OptOut[] }>('/api/v2/ai/optouts')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const list = data?.optouts || []

  async function save(address: string, on: boolean) {
    setBusy(true)
    setSaveError(null)
    try {
      await consoleFetch('/api/v2/ai/optouts', { method: 'POST', body: JSON.stringify({ email: address, on }) })
      if (on) setEmail('')
      await reload()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <details className="ll-card" style={{ marginBottom: 16 }}>
      <summary>
        <strong>Do not email</strong> <span className="ll-muted ll-small">({list.length})</span>
      </summary>
      <p className="ll-muted ll-small">
        The AI never emails these addresses again; the system refuses it even if an email is approved. Win-back emails carry an unsubscribe link that adds people here. Add anyone who asks by reply or phone.
      </p>
      {(error || saveError) && <div className="ll-error">{error || saveError}</div>}
      <form
        className="ll-row"
        style={{ gap: 8, flexWrap: 'wrap', margin: '8px 0' }}
        onSubmit={(e) => {
          e.preventDefault()
          if (email.trim()) save(email.trim(), true)
        }}
      >
        <input type="email" placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email address to stop emailing" />
        <button type="submit" className="ll-btn small" disabled={busy || !email.trim()}>
          Add
        </button>
      </form>
      {list.length > 0 && (
        <ul className="ll-small" style={{ margin: 0, paddingLeft: 18 }}>
          {list.map((o) => (
            <li key={o.email}>
              {o.email} <span className="ll-muted">· {o.source === 'link' ? 'unsubscribed' : 'added by you'} {formatAgo(o.created_at)}</span>{' '}
              <button type="button" className="ll-btn small secondary" disabled={busy} onClick={() => save(o.email, false)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </details>
  )
}

/** Every email the AI wrote, in full, whether it went out, is waiting, or was stopped. */
export function AiEmailsPanel({ agents }: { agents: AiAgent[] }) {
  const { data, error, loading } = useConsoleGet<{ emails?: AiEmail[] }>('/api/v2/ai/emails')
  const [filter, setFilter] = useState<Filter>('all')
  const emails = (data?.emails || []).filter((e) => matches(e, filter))
  const agentName = (key: string) => agents.find((a) => a.key === key)?.name || key

  return (
    <section>
      <div className="ll-row" style={{ justifyContent: 'space-between', gap: 12, margin: '0 0 12px', flexWrap: 'wrap' }}>
        <p className="ll-muted ll-small" style={{ margin: 0 }}>
          Every email the agents wrote, exactly as written. The email template adds “Dear name,” above and the LankaLux sign-off below, and an unsubscribe link on win-back emails. Waiting ones are approved on the Approvals tab.
        </p>
        <div className="ll-seg ll-seg-sm" role="group" aria-label="Which emails">
          {(['all', 'waiting', 'sent', 'stopped'] as Filter[]).map((f) => (
            <button key={f} type="button" className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>
              {f === 'all' ? 'All' : f === 'waiting' ? 'Waiting' : f === 'sent' ? 'Sent' : 'Stopped'}
            </button>
          ))}
        </div>
      </div>
      <DoNotEmail />
      {error && <div className="ll-error">{error}</div>}
      {loading && !data ? (
        <p className="ll-muted">Loading…</p>
      ) : emails.length === 0 ? (
        <div className="ll-card">
          <p className="ll-empty">{filter === 'all' ? 'The AI has not written any emails yet.' : 'None here.'}</p>
        </div>
      ) : (
        <div className="ll-ai-list">
          {emails.map((e) => (
            <article key={e.id} className="ll-card ll-ai-approval">
              <div className="ll-row" style={{ justifyContent: 'space-between', gap: 8 }}>
                <span className={`ll-pill ${STATE[e.state].pill}`}>{STATE[e.state].label}</span>
                <span className="ll-muted ll-small">
                  {e.state === 'sent' && e.executed_at ? `sent ${formatAgo(e.executed_at)}` : `written ${formatAgo(e.created_at)}`}
                </span>
              </div>
              <h3 style={{ marginTop: 10 }}>{e.subject || '(no subject)'}</h3>
              <p className="ll-muted ll-small">
                {agentName(e.agent_key)}
                {e.to && ` · to ${e.to}`}
                {e.request_id && (
                  <>
                    {' · '}
                    <Link href={`/console/requests/${e.request_id}`}>{e.request_id}</Link>
                  </>
                )}
              </p>
              <div className="ll-ai-email-body">{e.body}</div>
              <p className="ll-muted ll-small" style={{ margin: '8px 0 0' }}>
                {[decidedLine(e), e.decision_note && `Note: ${e.decision_note}`, e.reasoning && `Why: ${e.reasoning}`].filter(Boolean).join(' · ')}
              </p>
              {e.error && <p className="ll-agent-error">Error: {e.error}</p>}
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
