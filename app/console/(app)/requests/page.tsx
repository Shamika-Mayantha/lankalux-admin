'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { consoleFetch } from '@/lib/console-api'
import { STATUS_LABEL, normalizeStatus, REQUEST_STATUSES } from '@/config/status'
import type { ClientRequestRow } from '@/types/domain'

export default function RequestsPage() {
  const [rows, setRows] = useState<ClientRequestRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState('all')
  const [q, setQ] = useState('')

  useEffect(() => {
    consoleFetch('/api/v2/requests')
      .then((d) => setRows(d.requests || []))
      .catch((e) => setError(e.message))
  }, [])

  const shown = rows.filter((r) => {
    const s = normalizeStatus(r.status) || 'new'
    if (status !== 'all' && s !== status) return false
    if (q && !`${r.client_name} ${r.email} ${r.id}`.toLowerCase().includes(q.toLowerCase())) return false
    return true
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
      <div className="ll-row" style={{ marginBottom: 16 }}>
        <input placeholder="Search name, email, id" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">All statuses</option>
          {REQUEST_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
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
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => {
            const s = normalizeStatus(r.status) || 'new'
            return (
              <tr key={r.id}>
                <td>
                  <Link href={`/console/requests/${r.id}`}>{r.id}</Link>
                </td>
                <td>
                  <div>{r.client_name}</div>
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
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
