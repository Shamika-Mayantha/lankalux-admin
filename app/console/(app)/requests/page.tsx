'use client'

import Link from 'next/link'
import { Suspense, useEffect, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { consoleFetch } from '@/lib/console-api'
import { STATUS_LABEL, normalizeStatus, REQUEST_STATUSES, type RequestStatus } from '@/config/status'
import type { ClientRequestRow } from '@/types/domain'
import { useMe } from '@/features/console/StaffContext'
import { memberName, useTeam } from '@/features/console/useTeam'

function isStatus(value: string): value is RequestStatus {
  return (REQUEST_STATUSES as readonly string[]).includes(value)
}

function RequestsPageInner() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [rows, setRows] = useState<ClientRequestRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const me = useMe()
  const supervisor = me.role === 'supervisor'
  const team = useTeam()

  const statusParam = searchParams.get('status') || 'all'
  const status = statusParam === 'all' || isStatus(statusParam) ? statusParam : 'all'
  // all | mine | unassigned | <user id>
  const agent = searchParams.get('agent') || 'all'

  useEffect(() => {
    consoleFetch('/api/v2/requests')
      .then((d) => setRows(d.requests || []))
      .catch((e) => setError(e.message))
  }, [])

  function setParam(key: string, next: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (!next || next === 'all') params.delete(key)
    else params.set(key, next)
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname)
  }

  const shown = rows.filter((r) => {
    const s = normalizeStatus(r.status) || 'new'
    if (status !== 'all' && s !== status) return false
    if (agent === 'mine' && r.assigned_agent_id !== me.id) return false
    if (agent === 'unassigned' && r.assigned_agent_id) return false
    if (agent !== 'all' && agent !== 'mine' && agent !== 'unassigned' && r.assigned_agent_id !== agent) return false
    if (q && !`${r.client_name} ${r.email} ${r.id}`.toLowerCase().includes(q.toLowerCase())) return false
    return true
  })

  return (
    <div>
      <div className="ll-row" style={{ justifyContent: 'space-between' }}>
        <div>
          <h1 className="ll-h1">Requests</h1>
          <p className="ll-sub">
            {supervisor ? 'Every enquiry, in one place.' : 'Requests you created and the ones assigned to you.'}
          </p>
        </div>
        <Link className="ll-btn" href="/console/requests/new">
          New request
        </Link>
      </div>
      {error && <div className="ll-error">{error}</div>}
      <div className="ll-filters">
        <input placeholder="Search name, email, id" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={status} onChange={(e) => setParam('status', e.target.value)}>
          <option value="all">All statuses</option>
          {REQUEST_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <select value={agent} onChange={(e) => setParam('agent', e.target.value)} aria-label="Filter by agent">
          <option value="all">{supervisor ? 'All agents' : 'All my requests'}</option>
          <option value="mine">Assigned to me</option>
          {supervisor ? <option value="unassigned">Unassigned</option> : null}
          {supervisor
            ? team.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.full_name || m.email}
                </option>
              ))
            : null}
        </select>
      </div>
      <table className="ll-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Client</th>
            <th>Travel</th>
            <th>Party</th>
            <th>Status</th>
            <th>Agent</th>
            <th>Sold</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => {
            const s = normalizeStatus(r.status) || 'new'
            const href = `/console/requests/${r.id}`
            return (
              <tr key={r.id}>
                <td>
                  <Link href={href}>{r.id}</Link>
                </td>
                <td>
                  <div>
                    <Link href={href}>{r.client_name}</Link>
                  </div>
                  <div className="ll-muted">{r.email}</div>
                </td>
                <td>
                  {r.start_date || '—'} → {r.end_date || '—'}
                </td>
                <td>
                  {r.number_of_adults || 0} ad · {r.number_of_children || 0} ch
                </td>
                <td>
                  <span className={`ll-pill ${s}`}>{STATUS_LABEL[s]}</span>
                </td>
                <td className="ll-muted">{memberName(team, r.assigned_agent_id) || 'Unassigned'}</td>
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
              </tr>
            )
          })}
          {shown.length === 0 ? (
            <tr>
              <td colSpan={7} className="ll-muted" style={{ textAlign: 'center' }}>
                No requests match this filter.
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
