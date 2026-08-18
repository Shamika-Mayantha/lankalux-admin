'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { consoleFetch } from '@/lib/console-api'
import { STATUS_LABEL, normalizeStatus, type RequestStatus } from '@/config/status'
import type { ClientRequestRow } from '@/types/domain'

type Range = 'today' | 'week' | 'month' | 'all'

function startOfRange(range: Range) {
  const now = new Date()
  if (range === 'all') return null
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  if (range === 'week') d.setDate(d.getDate() - d.getDay())
  if (range === 'month') d.setDate(1)
  return d
}

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

export default function DashboardPage() {
  const [rows, setRows] = useState<ClientRequestRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [range, setRange] = useState<Range>('all')

  useEffect(() => {
    consoleFetch('/api/v2/requests')
      .then((d) => setRows(d.requests || []))
      .catch((e) => setError(e.message))
  }, [])

  const soldRows = useMemo(() => rows.filter((r) => (normalizeStatus(r.status) || 'new') === 'sold'), [rows])

  const filtered = useMemo(() => {
    const from = startOfRange(range)
    return soldRows.filter((r) => {
      if (!from) return true
      const created = new Date(r.created_at)
      return created >= from
    })
  }, [soldRows, range])

  const counts = useMemo(() => {
    const c: Record<RequestStatus, number> = { new: 0, follow_up: 0, sold: 0, after_sales: 0, cancelled: 0, expired: 0 }
    for (const r of filtered) {
      const s = normalizeStatus(r.status) || 'new'
      c[s]++
    }
    return c
  }, [filtered])

  const recentRequests = useMemo(
    () =>
      [...rows]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 12),
    [rows]
  )

  const today = new Date().toISOString().slice(0, 10)
  const upcomingArrivals = useMemo(
    () =>
      soldRows
        .filter((r) => r.start_date && r.start_date >= today)
        .sort((a, b) => (a.start_date || '').localeCompare(b.start_date || ''))
        .slice(0, 6),
    [soldRows, today]
  )
  const upcomingDepartures = useMemo(
    () =>
      soldRows
        .filter((r) => r.end_date && r.end_date >= today)
        .sort((a, b) => (a.end_date || '').localeCompare(b.end_date || ''))
        .slice(0, 6),
    [soldRows, today]
  )

  return (
    <div>
      <h1 className="ll-greeting">{greeting()}</h1>
      <p className="ll-sub">Actionable work for the LankaLux desk.</p>
      {error && <div className="ll-error">{error}</div>}
      <div className="ll-row" style={{ marginBottom: 18 }}>
        {(['today', 'week', 'month', 'all'] as Range[]).map((r) => (
          <button key={r} className={`ll-btn ${range === r ? '' : 'secondary'}`} onClick={() => setRange(r)}>
            {r === 'all' ? 'All time' : r === 'today' ? 'Today' : r === 'week' ? 'This week' : 'This month'}
          </button>
        ))}
        <Link href="/console/requests/new" className="ll-btn">
          New request
        </Link>
      </div>
      <div className="ll-grid">
        {(Object.keys(STATUS_LABEL) as RequestStatus[]).map((s) => (
          <div className="ll-card" key={s}>
            <h3>{s === 'new' ? 'Requests' : STATUS_LABEL[s]}</h3>
            <p className="ll-stat">{counts[s]}</p>
          </div>
        ))}
      </div>
      <div className="ll-grid-2" style={{ marginTop: 18 }}>
        <div className="ll-card">
          <h3>Upcoming arrivals</h3>
          {upcomingArrivals.length === 0 && <p className="ll-muted">None found.</p>}
          {upcomingArrivals.map((r) => (
            <p key={r.id}>
              <Link href={`/console/requests/${r.id}`}>{r.client_name}</Link> · {r.start_date}
            </p>
          ))}
        </div>
        <div className="ll-card">
          <h3>Upcoming departures</h3>
          {upcomingDepartures.length === 0 && <p className="ll-muted">None found.</p>}
          {upcomingDepartures.map((r) => (
            <p key={r.id}>
              <Link href={`/console/requests/${r.id}`}>{r.client_name}</Link> · {r.end_date}
            </p>
          ))}
        </div>
      </div>
      <h2 style={{ marginTop: 32 }}>Recent requests</h2>
      <table className="ll-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Client</th>
            <th>Dates</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {recentRequests.map((r) => {
            const s = normalizeStatus(r.status) || 'new'
            return (
              <tr key={r.id}>
                <td>
                  <Link href={`/console/requests/${r.id}`}>{r.id}</Link>
                </td>
                <td>{r.client_name}</td>
                <td>
                  {r.start_date || '—'} → {r.end_date || '—'}
                </td>
                <td>
                  <span className={`ll-pill ${s}`}>{STATUS_LABEL[s]}</span>
                </td>
              </tr>
            )
          })}
          {recentRequests.length === 0 ? (
            <tr>
              <td colSpan={4} className="ll-muted" style={{ textAlign: 'center' }}>
                No recent requests yet.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  )
}
