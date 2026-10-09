'use client'

import { useConsoleGet } from '@/lib/console-api'
import type { VehicleRecord } from '@/types/domain'

export default function VehiclesPage() {
  const { data, error, loading } = useConsoleGet<{ vehicles?: VehicleRecord[] }>('/api/v2/vehicles')
  const vehicles = data?.vehicles || []

  return (
    <div>
      <h1 className="ll-h1">Vehicles</h1>
      <p className="ll-sub">LankaLux fleet, using the existing photographs.</p>
      {error && <div className="ll-error">{error}</div>}
      {loading && <p className="ll-muted">Loading fleet…</p>}
      <div className="ll-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
        {vehicles.map((v) => (
          <div className="ll-card" key={v.id}>
            {v.photos[0] && <img src={v.photos[0]} alt={v.name} className="ll-thumb" loading="lazy" decoding="async" />}
            <h3>{v.type}</h3>
            <p className="ll-card-title">{v.name}</p>
            <p className="ll-muted">
              {v.passenger_capacity} passengers · {v.luggage_capacity || '—'}
            </p>
            <p className="ll-muted">{v.description}</p>
            <span className="ll-pill">{v.availability_status}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
