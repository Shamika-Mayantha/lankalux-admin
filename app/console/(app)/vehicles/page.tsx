'use client'

import { useEffect, useState } from 'react'
import { consoleFetch } from '@/lib/console-api'
import type { VehicleRecord } from '@/types/domain'

export default function VehiclesPage() {
  const [vehicles, setVehicles] = useState<VehicleRecord[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    consoleFetch('/api/v2/vehicles')
      .then((d) => setVehicles(d.vehicles || []))
      .catch((e) => setError(e.message))
  }, [])

  return (
    <div>
      <h1 className="ll-h1">Vehicles</h1>
      <p className="ll-sub">LankaLux fleet, using the existing photographs.</p>
      {error && <div className="ll-error">{error}</div>}
      <div className="ll-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
        {vehicles.map((v) => (
          <div className="ll-card" key={v.id}>
            {v.photos[0] && <img src={v.photos[0]} alt={v.name} style={{ width: '100%', height: 140, objectFit: 'cover', borderRadius: 10 }} />}
            <h3>{v.type}</h3>
            <p style={{ fontSize: 22 }}>{v.name}</p>
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
