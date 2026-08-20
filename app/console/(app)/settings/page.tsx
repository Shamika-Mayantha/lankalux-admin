'use client'

import { useEffect, useState } from 'react'
import { consoleFetch } from '@/lib/console-api'
import { BRAND } from '@/config/brand'

type Flags = Record<string, string>

type InvoiceSettings = {
  beneficiary_name: string | null
  bank_name: string | null
  account_number: string | null
  branch_name: string | null
  swift_code: string | null
  iban: string | null
  payment_reference_note: string | null
  instructions_note: string | null
  show_vehicle_registration: boolean
  default_client_note: string | null
  visible_fields: Record<string, boolean>
}

const emptySettings: InvoiceSettings = {
  beneficiary_name: '',
  bank_name: '',
  account_number: '',
  branch_name: '',
  swift_code: '',
  iban: '',
  payment_reference_note: 'Please quote your invoice number as the payment reference.',
  instructions_note: '',
  show_vehicle_registration: false,
  default_client_note: 'Thank you for choosing LankaLux. Please quote your invoice number when making payment.',
  visible_fields: {
    beneficiary_name: true,
    bank_name: true,
    account_number: true,
    branch_name: true,
    swift_code: true,
    iban: false,
  },
}

const VISIBLE_KEYS = [
  ['beneficiary_name', 'Beneficiary name'],
  ['bank_name', 'Bank'],
  ['account_number', 'Account number'],
  ['branch_name', 'Branch'],
  ['swift_code', 'SWIFT'],
  ['iban', 'IBAN'],
] as const

export default function SettingsPage() {
  const [flags, setFlags] = useState<Flags>({})
  const [meta, setMeta] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [settings, setSettings] = useState<InvoiceSettings>(emptySettings)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    consoleFetch('/api/v2/settings')
      .then((d) => {
        setFlags(d.flags || {})
        setMeta({ supabase: d.supabase, openai: d.openai, smtp: d.smtp, whatsapp: d.whatsapp })
      })
      .catch((e) => setError(e.message))
    consoleFetch('/api/invoices/settings')
      .then((d) =>
        setSettings({
          ...emptySettings,
          ...d.settings,
          visible_fields: { ...emptySettings.visible_fields, ...(d.settings?.visible_fields || {}) },
        })
      )
      .catch(() => {})
  }, [])

  function pill(v: string | undefined) {
    const ok = v === 'configured'
    return <span className={`ll-pill ${ok ? 'sold' : 'cancelled'}`}>{ok ? 'Configured ✓' : 'Not configured'}</span>
  }

  async function saveSettings() {
    try {
      setSaving(true)
      setNotice(null)
      await consoleFetch('/api/invoices/settings', {
        method: 'PATCH',
        body: JSON.stringify(settings),
      })
      setNotice('Payment instructions saved. Only fields marked as client-visible appear on invoices.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save payment instructions.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <h1 className="ll-h1">Settings</h1>
      <p className="ll-sub">Infrastructure status. Secret values are never shown.</p>
      {error && <div className="ll-error">{error}</div>}
      {notice && <div className="ll-ok">{notice}</div>}
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

      <div className="ll-card" style={{ marginTop: 24 }}>
        <h3>Payment instructions</h3>
        <p className="ll-muted">
          Stored once and shown on client invoices only when a field is marked as visible and has a value.
        </p>
        <div className="ll-form" style={{ marginTop: 16 }}>
          <label>
            Beneficiary name
            <input
              value={settings.beneficiary_name || ''}
              onChange={(e) => setSettings((s) => ({ ...s, beneficiary_name: e.target.value }))}
            />
          </label>
          <label>
            Bank
            <input value={settings.bank_name || ''} onChange={(e) => setSettings((s) => ({ ...s, bank_name: e.target.value }))} />
          </label>
          <label>
            Account number
            <input
              value={settings.account_number || ''}
              onChange={(e) => setSettings((s) => ({ ...s, account_number: e.target.value }))}
            />
          </label>
          <label>
            Branch
            <input value={settings.branch_name || ''} onChange={(e) => setSettings((s) => ({ ...s, branch_name: e.target.value }))} />
          </label>
          <label>
            SWIFT
            <input value={settings.swift_code || ''} onChange={(e) => setSettings((s) => ({ ...s, swift_code: e.target.value }))} />
          </label>
          <label>
            IBAN
            <input value={settings.iban || ''} onChange={(e) => setSettings((s) => ({ ...s, iban: e.target.value }))} />
          </label>
          <label>
            Payment reference instruction
            <input
              value={settings.payment_reference_note || ''}
              onChange={(e) => setSettings((s) => ({ ...s, payment_reference_note: e.target.value }))}
            />
          </label>
          <label>
            Additional instructions
            <textarea
              value={settings.instructions_note || ''}
              onChange={(e) => setSettings((s) => ({ ...s, instructions_note: e.target.value }))}
            />
          </label>
          <label>
            Default client note
            <textarea
              value={settings.default_client_note || ''}
              onChange={(e) => setSettings((s) => ({ ...s, default_client_note: e.target.value }))}
            />
          </label>
          <label className="ll-check">
            <input
              type="checkbox"
              checked={settings.show_vehicle_registration}
              onChange={(e) => setSettings((s) => ({ ...s, show_vehicle_registration: e.target.checked }))}
            />
            Show vehicle registration on invoices
          </label>
          <p className="ll-muted">Client-visible fields</p>
          {VISIBLE_KEYS.map(([key, label]) => (
            <label className="ll-check" key={key}>
              <input
                type="checkbox"
                checked={settings.visible_fields[key] !== false}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    visible_fields: { ...s.visible_fields, [key]: e.target.checked },
                  }))
                }
              />
              {label}
            </label>
          ))}
          <button className="ll-btn" disabled={saving} onClick={() => void saveSettings()}>
            Save payment instructions
          </button>
        </div>
      </div>

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
