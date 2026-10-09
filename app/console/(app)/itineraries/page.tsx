'use client'

import Link from 'next/link'
import { consoleGet, mapLimited, useConsoleResource } from '@/lib/console-api'
import { formatDayRange } from '@/lib/format'
import { RowLink, SkeletonRows } from '@/components/ui/RowLink'
import type { ClientRequestRow, ItineraryRecord } from '@/types/domain'

type Row = { request: ClientRequestRow; itineraries: ItineraryRecord[] }

async function loadRows(): Promise<Row[]> {
  const list = await consoleGet<{ requests?: ClientRequestRow[] }>('/api/v2/requests')
  const reqs = (list.requests || []).slice(0, 40)
  const detailed = await mapLimited(reqs, 8, async (r) => {
    const d = await consoleGet<{ itineraries?: ItineraryRecord[] }>(`/api/v2/requests/${r.id}`).catch(() => ({
      itineraries: [] as ItineraryRecord[],
    }))
    return { request: r, itineraries: d.itineraries || [] }
  })
  return detailed.filter((x) => x.itineraries.some((i) => i.payload?.days?.length))
}

export default function ItinerariesPage() {
  const { data, error, loading } = useConsoleResource('itineraries', loadRows)
  const rows = data || []

  return (
    <div>
      <h1 className="ll-h1">Itineraries</h1>
      <p className="ll-sub">Generated journeys across open requests.</p>
      {error && <div className="ll-error">{error}</div>}
      <table className="ll-table">
        <thead>
          <tr>
            <th>Request</th>
            <th>Travel</th>
            <th>Selected</th>
            <th>Options</th>
          </tr>
        </thead>
        <tbody>
          {loading ? <SkeletonRows cols={4} /> : null}
          {!loading && rows.length === 0 ? (
            <tr>
              <td colSpan={4} className="ll-muted" style={{ textAlign: 'center' }}>
                No generated itineraries yet.
              </td>
            </tr>
          ) : null}
          {rows.map((r) => {
            const selected = r.itineraries.find((i) => i.is_selected)
            const href = `/console/requests/${r.request.id}`
            return (
              <RowLink key={r.request.id} href={href}>
                <td>
                  <Link href={href}>{r.request.client_name}</Link>
                  <div className="ll-muted">{r.request.id}</div>
                </td>
                <td>{formatDayRange(r.request.start_date, r.request.end_date)}</td>
                <td>{selected?.title || '—'}</td>
                <td>{r.itineraries.filter((i) => i.payload?.days?.length).map((i) => i.option_number).join(', ')}</td>
              </RowLink>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
