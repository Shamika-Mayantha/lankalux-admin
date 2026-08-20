'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { consoleFetch } from '@/lib/console-api'
import type { ActivityEvent, ClientRequestRow } from '@/types/domain'

export default function CommunicationsPage() {
  const [events, setEvents] = useState<Array<ActivityEvent & { client?: string }>>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      try {
        const list = await consoleFetch('/api/v2/requests')
        const reqs: ClientRequestRow[] = (list.requests || []).slice(0, 30)
        const all: Array<ActivityEvent & { client?: string }> = []
        for (const r of reqs) {
          const d = await consoleFetch(`/api/v2/requests/${r.id}`)
          for (const a of d.activity || []) {
            if (['email_sent', 'follow_up_email_sent', 'whatsapp_shared', 'hotel_proposal_attached', 'share_link_created'].includes(a.event_type)) {
              all.push({ ...a, client: r.client_name || r.id, request_id: r.id })
            }
          }
        }
        all.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
        setEvents(all.slice(0, 80))
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load')
      }
    })()
  }, [])

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
          {events.map((e, i) => (
            <tr key={e.id || i}>
              <td>{e.created_at ? new Date(e.created_at).toLocaleString() : ''}</td>
              <td>
                <Link href={`/console/requests/${e.request_id}`}>{e.client}</Link>
              </td>
              <td>{e.event_type}</td>
              <td>{e.actor || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
