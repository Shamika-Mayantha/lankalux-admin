'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { consoleFetch } from '@/lib/console-api'
import type { ClientRequestRow } from '@/types/domain'

export default function ClientsPage() {
  const [rows, setRows] = useState<ClientRequestRow[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    consoleFetch('/api/v2/requests')
      .then((d) => setRows(d.requests || []))
      .catch((e) => setError(e.message))
  }, [])

  const clients = useMemo(() => {
    const map = new Map<string, ClientRequestRow[]>()
    for (const r of rows) {
      const key = (r.email || r.whatsapp || r.client_name || r.id).toLowerCase()
      map.set(key, [...(map.get(key) || []), r])
    }
    return Array.from(map.values())
  }, [rows])

  return (
    <div>
      <h1 className="ll-h1">Clients</h1>
      <p className="ll-sub">Derived from existing request records — production contacts are not duplicated.</p>
      {error && <div className="ll-error">{error}</div>}
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
          {clients.map((group) => {
            const r = group[0]
            return (
              <tr key={r.id}>
                <td>{r.client_name}</td>
                <td>{r.email}</td>
                <td>{r.whatsapp || '—'}</td>
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
