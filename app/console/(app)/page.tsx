'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { consoleFetch } from '@/lib/console-api'
import { STATUS_LABEL, normalizeStatus, type RequestStatus } from '@/config/status'
import type { ClientRequestRow } from '@/types/domain'

type Range = 'today' | 'week' | 'month' | 'all'
type StatusFilter = RequestStatus | 'all'

const RANGE_LABEL: Record<Range, string> = {
  today: 'Today',
  week: 'This week',
  month: 'This month',
  all: 'All time',
}

function startOfRange(range: Range) {
  const now = new Date()
  if (range === 'all') return null
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  if (range === 'week') d.setDate(d.getDate() - d.getDay())
  if (range === 'month') d.setDate(1)
  return d
}

function inCreatedRange(createdAt: string | null | undefined, range: Range) {
  const from = startOfRange(range)
  if (!from) return true
  if (!createdAt) return false
  const created = new Date(createdAt)
  if (Number.isNaN(created.getTime())) return false
  return created >= from
}

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

function requestStatus(row: ClientRequestRow): RequestStatus {
  return normalizeStatus(row.status) || 'new'
}

export default function DashboardPage() {
  const [rows, setRows] = useState<ClientRequestRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [range, setRange] = useState<Range>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

  useEffect(() => {
    consoleFetch('/api/v2/requests')
      .then((d) => setRows(d.requests || []))
      .catch((e) => setError(e.message))
  }, [])

  const soldRows = useMemo(() => rows.filter((r) => requestStatus(r) === 'sold'), [rows])

  const rangedRows = useMemo(() => rows.filter((r) => inCreatedRange(r.created_at, range)), [rows, range])

  const counts = useMemo(() => {
    const c: Record<RequestStatus, number> = { new: 0, follow_up: 0, sold: 0, after_sales: 0, cancelled: 0, expired: 0 }
    for (const r of rangedRows) {
      c[requestStatus(r)]++
    }
    return c
  }, [rangedRows])

  const listedRequests = useMemo(() => {
    const list = statusFilter === 'all' ? rangedRows : rangedRows.filter((r) => requestStatus(r) === statusFilter)
    return [...list].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  }, [rangedRows, statusFilter])

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

  const listTitle =
    statusFilter === 'all'
      ? range === 'all'
        ? 'All requests'
        : `Requests · ${RANGE_LABEL[range]}`
      : `${STATUS_LABEL[statusFilter]} · ${RANGE_LABEL[range]}`

  const requestsHref = statusFilter === 'all' ? '/console/requests' : `/console/requests?status=${statusFilter}`

  return (
    <div>
      <h1 className="ll-greeting">{greeting()}</h1>
      <p className="ll-sub">Actionable work for the LankaLux desk.</p>
      {error && <div className="ll-error">{error}</div>}
      <div className="ll-row" style={{ marginBottom: 18 }}>
        {(['today', 'week', 'month', 'all'] as Range[]).map((r) => (
          <button key={r} className={`ll-btn ${range === r ? '' : 'secondary'}`} onClick={() => setRange(r)}>
            {RANGE_LABEL[r]}
          </button>
        ))}
        <Link href="/console/requests/new" className="ll-btn">
          New request
        </Link>
        <Link href="/console/invoices" className="ll-btn secondary">
          Invoices
        </Link>
        <Link href="/console/payments" className="ll-btn secondary">
          Payments
        </Link>
      </div>
      <div className="ll-grid">
        {(Object.keys(STATUS_LABEL) as RequestStatus[]).map((s) => (
          <button
            type="button"
            className={`ll-card ll-stat-card ${statusFilter === s ? 'active' : ''}`}
            key={s}
            onClick={() => setStatusFilter((prev) => (prev === s ? 'all' : s))}
          >
            <h3>{STATUS_LABEL[s]}</h3>
            <p className="ll-stat">{counts[s]}</p>
          </button>
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
      <div className="ll-row" style={{ marginTop: 32, marginBottom: 12, justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h2 style={{ margin: 0 }}>
          {listTitle} <span className="ll-muted">({listedRequests.length})</span>
        </h2>
        <Link href={requestsHref} className="ll-btn secondary">
          Open in Requests
        </Link>
      </div>
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
          {listedRequests.map((r) => {
            const s = requestStatus(r)
            const href = `/console/requests/${r.id}`
            return (
              <tr key={r.id}>
                <td>
                  <Link href={href}>{r.id}</Link>
                </td>
                <td>
                  <Link href={href}>{r.client_name}</Link>
                </td>
                <td>
                  {r.start_date || '—'} → {r.end_date || '—'}
                </td>
                <td>
                  <span className={`ll-pill ${s}`}>{STATUS_LABEL[s]}</span>
                </td>
              </tr>
            )
          })}
          {listedRequests.length === 0 ? (
            <tr>
              <td colSpan={4} className="ll-muted" style={{ textAlign: 'center' }}>
                No requests in this period.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  )
}
