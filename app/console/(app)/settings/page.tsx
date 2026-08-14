'use client'

import { useEffect, useState } from 'react'
import { consoleFetch } from '@/lib/console-api'
import { BRAND } from '@/config/brand'

type Flags = Record<string, string>

export default function SettingsPage() {
  const [flags, setFlags] = useState<Flags>({})
  const [meta, setMeta] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    consoleFetch('/api/v2/settings')
      .then((d) => {
        setFlags(d.flags || {})
        setMeta({ supabase: d.supabase, openai: d.openai, smtp: d.smtp, whatsapp: d.whatsapp })
      })
      .catch((e) => setError(e.message))
  }, [])

  function pill(v: string | undefined) {
    const ok = v === 'configured'
    return <span className={`ll-pill ${ok ? 'sold' : 'cancelled'}`}>{ok ? 'Configured ✓' : 'Not configured'}</span>
  }

  return (
    <div>
      <h1 className="ll-h1">Settings</h1>
      <p className="ll-sub">Infrastructure status. Secret values are never shown.</p>
      {error && <div className="ll-error">{error}</div>}
      <div className="ll-card">
        <h3>Company</h3>
        <p className="ll-card-title">LankaLux</p>
        <p className="ll-muted">{BRAND.tagline}</p>
      </div>
      <table className="ll-table" style={{ marginTop: 18 }}>
        <thead>
          <tr>
            <th>Integration</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Supabase</td>
            <td>{pill(meta.supabase === 'configured' ? 'configured' : flags.NEXT_PUBLIC_SUPABASE_URL)}</td>
          </tr>
          <tr>
            <td>OpenAI</td>
            <td>{pill(flags.OPENAI_API_KEY)}</td>
          </tr>
          <tr>
            <td>Email (SMTP)</td>
            <td>{pill(meta.smtp)}</td>
          </tr>
          <tr>
            <td>WhatsApp</td>
            <td>
              <span className="ll-pill sold">Click-to-chat (wa.me)</span>
            </td>
          </tr>
        </tbody>
      </table>
      <div className="ll-card" style={{ marginTop: 18 }}>
        <h3>Default itinerary instructions</h3>
        <p className="ll-muted">
          Prompt version <code>ll-itinerary-v2-2026-08-14</code>. Option 1 balanced, option 2 relaxed, option 3
          experience. Images are mapped server-side from existing LankaLux photographs.
        </p>
      </div>
      <div className="ll-card" style={{ marginTop: 18 }}>
        <h3>Templates</h3>
        <p className="ll-muted">
          Email and WhatsApp copy is generated from the saved selected itinerary via <code>getPublishedItinerary</code>.
          Administrators can edit the email introduction before sending.
        </p>
      </div>
    </div>
  )
}
