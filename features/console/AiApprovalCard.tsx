'use client'

import { useState } from 'react'
import Link from 'next/link'
import { formatAgo } from '@/lib/format'
import { readable } from '@/features/console/ai-labels'
import type { AiPendingAction } from '@/services/ai-console.service'

/** An action waiting for the owner, with Approve / Reject (AI page Approvals tab and the Headquarters). */

const LEVEL_LABEL: Record<number, string> = { 2: 'Manager or you', 3: 'Needs you' }

export function isMessage(a: AiPendingAction) {
  return a.action_type.startsWith('message.')
}

export type SendResult = { sent: number; waiting: number; failed: number; error?: string; channel?: 'email' } | null

export function sendNotice(r: SendResult): string | null {
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

export function ApprovalCard({
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
            {email
              ? `Email (we add “Dear name,” and the sign-off${a.action_type === 'message.win_back' ? ', plus an unsubscribe link' : ''}; you can edit it)`
              : 'Reply (you can edit it before sending)'}
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
