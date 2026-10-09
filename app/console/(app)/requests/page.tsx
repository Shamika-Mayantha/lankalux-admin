'use client'

import Link from 'next/link'
import { Suspense, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useConsoleGet } from '@/lib/console-api'
import { formatAgo, formatDayRange } from '@/lib/format'
import { RowLink, SkeletonRows } from '@/components/ui/RowLink'
import { STATUS_LABEL, normalizeStatus, REQUEST_STATUSES, type RequestStatus } from '@/config/status'
import type { ClientRequestRow } from '@/types/domain'

function isStatus(value: string): value is RequestStatus {
  return (REQUEST_STATUSES as readonly string[]).includes(value)
}

function RequestsPageInner() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { data, error, loading } = useConsoleGet<{ requests?: ClientRequestRow[] }>('/api/v2/requests')
  const rows = useMemo(() => data?.requests || [], [data])
  const [q, setQ] = useState('')

  const statusParam = searchParams.get('status') || 'all'
  const status = statusParam === 'all' || isStatus(statusParam) ? statusParam : 'all'

  function setStatus(next: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (!next || next === 'all') params.delete('status')
    else params.set('status', next)
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname)
  }

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length }
    for (const r of rows) {
      const s = normalizeStatus(r.status) || 'new'
      c[s] = (c[s] || 0) + 1
    }
    return c
  }, [rows])

  const needle = q.trim().toLowerCase()
  const digits = needle.replace(/\D/g, '')
  const shown = rows.filter((r) => {
    const s = normalizeStatus(r.status) || 'new'
    if (status !== 'all' && s !== status) return false
    if (!needle) return true
    if (`${r.client_name} ${r.email} ${r.id}`.toLowerCase().includes(needle)) return true
    return digits.length >= 4 && String(r.whatsapp || '').replace(/\D/g, '').includes(digits)
  })

  return (
    <div>
      <div className="ll-row" style={{ justifyContent: 'space-between' }}>
        <div>
          <h1 className="ll-h1">Requests</h1>
          <p className="ll-sub">Every enquiry, in one place.</p>
        </div>
        <Link className="ll-btn" href="/console/requests/new">
          New request
        </Link>
      </div>
      {error && <div className="ll-error">{error}</div>}
      <div className="ll-filters">
        <input
          type="search"
          placeholder="Search name, email, WhatsApp or ID"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search requests"
        />
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
          <option value="all">All statuses ({counts.all || 0})</option>
          {REQUEST_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]} ({counts[s] || 0})
            </option>
          ))}
        </select>
      </div>
      {!loading && (needle || status !== 'all') ? (
        <p className="ll-muted ll-result-count">
          Showing {shown.length} of {rows.length}
          {' · '}
          <button
            type="button"
            className="ll-link-btn"
            onClick={() => {
              setQ('')
              setStatus('all')
            }}
          >
            Clear filters
          </button>
        </p>
      ) : null}
      <table className="ll-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Client</th>
            <th>Travel</th>
            <th>Party</th>
            <th>Status</th>
            <th>Sold</th>
          </tr>
        </thead>
        <tbody>
          {loading ? <SkeletonRows cols={6} /> : null}
          {shown.map((r) => {
            const s = normalizeStatus(r.status) || 'new'
            const href = `/console/requests/${r.id}`
            return (
              <RowLink key={r.id} href={href}>
                <td>
                  <Link href={href}>{r.id}</Link>
                  {r.created_at ? <div className="ll-muted ll-small">{formatAgo(r.created_at)}</div> : null}
                </td>
                <td>
                  <div>
                    <Link href={href}>{r.client_name}</Link>
                  </div>
                  <div className="ll-muted">{r.email}</div>
                </td>
                <td>{formatDayRange(r.start_date, r.end_date)}</td>
                <td>
                  {r.number_of_adults || 0} ad · {r.number_of_children || 0} ch
                </td>
                <td>
                  <span className={`ll-pill ${s}`}>{STATUS_LABEL[s]}</span>
                </td>
                <td className="ll-muted">
                  {s === 'sold'
                    ? [
                        r.selected_option != null ? `Option ${Number(r.selected_option) + 1}` : null,
                        r.sold_price || r.budget,
                      ]
                        .filter(Boolean)
                        .join(' · ') || 'Choose itinerary & price'
                    : '—'}
                </td>
              </RowLink>
            )
          })}
          {!loading && shown.length === 0 ? (
            <tr>
              <td colSpan={6} className="ll-muted" style={{ textAlign: 'center' }}>
                {rows.length === 0 ? 'No requests yet.' : 'No requests match this filter.'}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  )
}

export default function RequestsPage() {
  return (
    <Suspense
      fallback={
        <div>
          <h1 className="ll-h1">Requests</h1>
          <p className="ll-muted">Loading requests…</p>
        </div>
      }
    >
      <RequestsPageInner />
    </Suspense>
  )
}
