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

export default function DashboardPage() {
  const [rows, setRows] = useState<ClientRequestRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [range, setRange] = useState<Range>('month')

  useEffect(() => {
    consoleFetch('/api/v2/requests')
      .then((d) => setRows(d.requests || []))
      .catch((e) => setError(e.message))
  }, [])

  const filtered = useMemo(() => {
    const from = startOfRange(range)
    return rows.filter((r) => {
      if (!from) return true
      const created = new Date(r.created_at)
      return created >= from
    })
  }, [rows, range])

  const counts = useMemo(() => {
    const c: Record<RequestStatus, number> = { new: 0, follow_up: 0, sold: 0, after_sales: 0, cancelled: 0 }
    for (const r of filtered) {
      const s = normalizeStatus(r.status) || 'new'
      c[s]++
    }
    return c
  }, [filtered])

  const today = new Date().toISOString().slice(0, 10)
  const upcomingArrivals = filtered.filter((r) => r.start_date && r.start_date >= today && normalizeStatus(r.status) !== 'cancelled').slice(0, 6)
  const upcomingDepartures = filtered.filter((r) => r.end_date && r.end_date >= today && normalizeStatus(r.status) !== 'cancelled').slice(0, 6)

  return (
    <div>
      <h1 className="ll-h1">Dashboard</h1>
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
            <h3>{STATUS_LABEL[s]}</h3>
            <p>{counts[s]}</p>
          </div>
        ))}
      </div>
      <div className="ll-grid" style={{ marginTop: 18, gridTemplateColumns: '1fr 1fr' }}>
        <div className="ll-card">
          <h3>Upcoming arrivals</h3>
          {upcomingArrivals.length === 0 && <p className="ll-muted">None in this range.</p>}
          {upcomingArrivals.map((r) => (
            <p key={r.id} style={{ fontSize: 15 }}>
              <Link href={`/console/requests/${r.id}`}>{r.client_name}</Link> · {r.start_date}
            </p>
          ))}
        </div>
        <div className="ll-card">
          <h3>Upcoming departures</h3>
          {upcomingDepartures.length === 0 && <p className="ll-muted">None in this range.</p>}
          {upcomingDepartures.map((r) => (
            <p key={r.id} style={{ fontSize: 15 }}>
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
          {filtered.slice(0, 12).map((r) => {
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
        </tbody>
      </table>
    </div>
  )
}
