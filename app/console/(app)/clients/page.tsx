'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useConsoleGet } from '@/lib/console-api'
import { SkeletonRows } from '@/components/ui/RowLink'
import type { ClientRequestRow } from '@/types/domain'

export default function ClientsPage() {
  const { data, error, loading } = useConsoleGet<{ requests?: ClientRequestRow[] }>('/api/v2/requests')
  const rows = useMemo(() => data?.requests || [], [data])
  const [q, setQ] = useState('')

  const clients = useMemo(() => {
    const map = new Map<string, ClientRequestRow[]>()
    for (const r of rows) {
      const key = (r.email || r.whatsapp || r.client_name || r.id).toLowerCase()
      map.set(key, [...(map.get(key) || []), r])
    }
    return Array.from(map.values())
  }, [rows])

  const needle = q.trim().toLowerCase()
  const shown = needle
    ? clients.filter((group) =>
        group.some((r) => `${r.client_name} ${r.email} ${r.whatsapp || ''} ${r.id}`.toLowerCase().includes(needle))
      )
    : clients

  return (
    <div>
      <h1 className="ll-h1">Clients</h1>
      <p className="ll-sub">Derived from existing request records — production contacts are not duplicated.</p>
      {error && <div className="ll-error">{error}</div>}
      <div className="ll-filters">
        <input
          type="search"
          placeholder="Search name, email, WhatsApp or request ID"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search clients"
        />
      </div>
      <table className="ll-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>WhatsApp</th>
            <th>Requests</th>
          </tr>
        </thead>
        <tbody>
          {loading ? <SkeletonRows cols={4} /> : null}
          {!loading && shown.length === 0 ? (
            <tr>
              <td colSpan={4} className="ll-muted" style={{ textAlign: 'center' }}>
                {clients.length === 0 ? 'No clients yet.' : 'No clients match this search.'}
              </td>
            </tr>
          ) : null}
          {shown.map((group) => {
            const r = group[0]
            return (
              <tr key={r.id}>
                <td>{r.client_name}</td>
                <td>{r.email ? <a href={`mailto:${r.email}`}>{r.email}</a> : '—'}</td>
                <td>
                  {r.whatsapp ? (
                    <a href={`https://wa.me/${r.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noreferrer">
                      {r.whatsapp}
                    </a>
                  ) : (
                    '—'
                  )}
                </td>
                <td>
                  {group.map((g) => (
                    <div key={g.id}>
                      <Link href={`/console/requests/${g.id}`}>{g.id}</Link>
                    </div>
                  ))}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
