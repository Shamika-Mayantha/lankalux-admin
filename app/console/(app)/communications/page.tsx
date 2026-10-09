'use client'

import Link from 'next/link'
import { consoleGet, mapLimited, useConsoleResource } from '@/lib/console-api'
import { formatAgo } from '@/lib/format'
import { SkeletonRows } from '@/components/ui/RowLink'
import type { ActivityEvent, ClientRequestRow } from '@/types/domain'

type CommEvent = ActivityEvent & { client?: string }

const EVENT_LABEL: Record<string, string> = {
  email_sent: 'Itinerary emailed',
  follow_up_email_sent: 'Follow-up email sent',
  whatsapp_shared: 'Shared on WhatsApp',
  hotel_proposal_attached: 'Hotel proposal attached',
  share_link_created: 'Share link created',
}

async function loadEvents(): Promise<CommEvent[]> {
  const list = await consoleGet<{ requests?: ClientRequestRow[] }>('/api/v2/requests')
  const reqs = (list.requests || []).slice(0, 30)
  const details = await mapLimited(reqs, 6, (r) =>
    consoleGet<{ activity?: ActivityEvent[] }>(`/api/v2/requests/${r.id}`).catch(() => ({ activity: [] }))
  )
  const all: CommEvent[] = []
  reqs.forEach((r, i) => {
    for (const a of details[i].activity || []) {
      if (a.event_type in EVENT_LABEL) all.push({ ...a, client: r.client_name || r.id, request_id: r.id })
    }
  })
  all.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
  return all.slice(0, 80)
}

export default function CommunicationsPage() {
  const { data, error, loading } = useConsoleResource('communications', loadEvents)
  const events = data || []

  return (
    <div>
      <h1 className="ll-h1">Communications</h1>
      <p className="ll-sub">Email, WhatsApp and share events from the activity log.</p>
      {error && <div className="ll-error">{error}</div>}
      <table className="ll-table">
        <thead>
          <tr>
            <th>When</th>
            <th>Client</th>
            <th>Event</th>
            <th>User</th>
          </tr>
        </thead>
        <tbody>
          {loading ? <SkeletonRows cols={4} /> : null}
          {!loading && events.length === 0 ? (
            <tr>
              <td colSpan={4} className="ll-muted" style={{ textAlign: 'center' }}>
                No emails or shares logged yet.
              </td>
            </tr>
          ) : null}
          {events.map((e, i) => (
            <tr key={e.id || i}>
              <td title={e.created_at ? new Date(e.created_at).toLocaleString() : undefined}>{formatAgo(e.created_at)}</td>
              <td>
                <Link href={`/console/requests/${e.request_id}`}>{e.client}</Link>
              </td>
              <td>{EVENT_LABEL[e.event_type] || e.event_type}</td>
              <td>{e.actor || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
