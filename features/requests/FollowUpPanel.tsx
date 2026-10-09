'use client'

import Link from 'next/link'
import { useState } from 'react'
import { consoleFetch, useConsoleGet } from '@/lib/console-api'

export type FollowUpItem = {
  requestId: string
  clientName: string
  email: string | null
  kind: 'reply' | 'chase'
  since: string
  hoursWaiting: number
}

export type FollowUpsResponse = {
  items?: FollowUpItem[]
  replyAfterHours?: number
  chaseAfterDays?: number
  chaseTemplateId?: string
}

export const FOLLOW_UPS_PATH = '/api/v2/follow-ups'

/** Shared with the nav badge, so both read one cached call. */
export function useFollowUps() {
  return useConsoleGet<FollowUpsResponse>(FOLLOW_UPS_PATH)
}

function waited(hours: number) {
  if (hours < 48) return `${hours} hours`
  return `${Math.floor(hours / 24)} days`
}

/** Enquiries that need a nudge: clients waiting on us, and quiet clients worth a polite follow-up. */
export function FollowUpPanel() {
  const { data, error, reload } = useFollowUps()
  const [sending, setSending] = useState<string | null>(null)
  const [sent, setSent] = useState<Record<string, true>>({})
  const [sendError, setSendError] = useState<string | null>(null)
  const items = data?.items || []
  if (error || !items.length) return null

  async function sendFollowUp(item: FollowUpItem) {
    if (!data?.chaseTemplateId) return
    setSending(item.requestId)
    setSendError(null)
    try {
      await consoleFetch('/api/v2/template-email', {
        method: 'POST',
        body: JSON.stringify({ requestId: item.requestId, templateId: data.chaseTemplateId }),
      })
      setSent((s) => ({ ...s, [item.requestId]: true }))
      reload().catch(() => {})
    } catch (err) {
      setSendError(`${item.clientName}: ${err instanceof Error ? err.message : 'Could not send the follow-up.'}`)
    } finally {
      setSending(null)
    }
  }

  return (
    <section className="ll-card ll-followups" aria-labelledby="ll-followups-title">
      <h3 id="ll-followups-title">Needs a nudge ({items.length})</h3>
      <p className="ll-muted">
        Clients with no reply from us after {data?.replyAfterHours ?? 24} hours, and clients who have gone quiet for{' '}
        {data?.chaseAfterDays ?? 3} days since our last message. A reminder email goes out each morning.
      </p>
      {sendError ? <div className="ll-error">{sendError}</div> : null}
      <ul>
        {items.map((item) => (
          <li key={item.requestId}>
            <div>
              <Link href={`/console/requests/${item.requestId}#emails`}>{item.clientName}</Link>{' '}
              <span className="ll-muted">{item.requestId}</span>
              <div className={`ll-small ${item.kind === 'reply' ? 'll-followups-due' : 'll-muted'}`}>
                {item.kind === 'reply'
                  ? `Waiting for our reply for ${waited(item.hoursWaiting)}`
                  : `No reply from the client for ${waited(item.hoursWaiting)}`}
              </div>
            </div>
            {item.kind === 'chase' ? (
              sent[item.requestId] ? (
                <span className="ll-muted ll-small">Follow-up sent</span>
              ) : (
                <button
                  type="button"
                  className="ll-btn secondary"
                  disabled={sending !== null || !item.email}
                  title={item.email ? `Sends "Whenever You Are Ready To Continue" to ${item.email}` : 'No client email'}
                  onClick={() => sendFollowUp(item)}
                >
                  {sending === item.requestId ? 'Sending…' : 'Send follow-up'}
                </button>
              )
            ) : (
              <Link className="ll-btn" href={`/console/requests/${item.requestId}#emails`}>
                Reply
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
