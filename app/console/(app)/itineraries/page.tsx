'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { consoleFetch } from '@/lib/console-api'
import type { ClientRequestRow, ItineraryRecord } from '@/types/domain'

type Row = { request: ClientRequestRow; itineraries: ItineraryRecord[] }

export default function ItinerariesPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      try {
        const list = await consoleFetch('/api/v2/requests')
        const reqs: ClientRequestRow[] = list.requests || []
        const detailed = await Promise.all(
          reqs.slice(0, 40).map(async (r) => {
            const d = await consoleFetch(`/api/v2/requests/${r.id}`)
            return { request: r, itineraries: d.itineraries || [] }
          })
        )
        setRows(detailed.filter((x) => x.itineraries.some((i: ItineraryRecord) => i.payload?.days?.length)))
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load')
      }
    })()
  }, [])

  return (
    <div>
      <h1 className="ll-h1">Itineraries</h1>
      <p className="ll-sub">Generated journeys across open requests.</p>
      {error && <div className="ll-error">{error}</div>}
      <table className="ll-table">
        <thead>
          <tr>
            <th>Request</th>
            <th>Selected</th>
            <th>Options</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const selected = r.itineraries.find((i) => i.is_selected)
            return (
              <tr key={r.request.id}>
                <td>
                  <Link href={`/console/requests/${r.request.id}`}>{r.request.client_name}</Link>
                  <div className="ll-muted">{r.request.id}</div>
                </td>
                <td>{selected?.title || '—'}</td>
                <td>{r.itineraries.filter((i) => i.payload?.days?.length).map((i) => i.option_number).join(', ')}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
