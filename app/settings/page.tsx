'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { authedJson } from '@/lib/authed-fetch'
import { ThemeToggle } from '@/components/ThemeToggle'

type InvoiceSettings = {
  beneficiary_name: string | null
  bank_name: string | null
  account_number: string | null
  branch_name: string | null
  swift_code: string | null
  iban: string | null
  payment_reference_note: string | null
  instructions_note: string | null
  visible_fields: Record<string, boolean>
}

const defaultSettings: InvoiceSettings = {
  beneficiary_name: '',
  bank_name: '',
  account_number: '',
  branch_name: '',
  swift_code: '',
  iban: '',
  payment_reference_note: '',
  instructions_note: '',
  visible_fields: {
    beneficiary_name: true,
    bank_name: true,
    account_number: true,
    branch_name: true,
    swift_code: true,
    iban: false,
  },
}

export default function SettingsPage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [settings, setSettings] = useState<InvoiceSettings>(defaultSettings)

  useEffect(() => {
    ;(async () => {
      const { data } = await supabase.auth.getSession()
      if (!data.session) {
        router.push('/login')
        return
      }
      setReady(true)
    })()
  }, [router])

  const load = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await authedJson<{ settings: InvoiceSettings }>('/api/invoices/settings')
      setSettings({ ...defaultSettings, ...data.settings })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load settings.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!ready) return
    void load()
  }, [ready, load])

  async function save() {
    try {
      setSaving(true)
      setError(null)
      await authedJson('/api/invoices/settings', {
        method: 'PATCH',
        body: JSON.stringify(settings),
      })
      alert('Payment instructions saved.')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save settings.')
    } finally {
      setSaving(false)
    }
  }

  if (!ready) {
    return (
      <div className="min-h-screen bg-page flex items-center justify-center">
        <div className="text-secondary">Loading…</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-page text-primary">
      <div className="w-full mx-auto px-6 sm:px-10 lg:px-14 xl:px-20 py-10 space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-4 bg-card border border-theme rounded-2xl px-6 py-5 shadow-card">
          <div>
            <h1 className="text-2xl font-semibold">Settings</h1>
            <p className="text-sm text-secondary mt-1">Configure LankaLux payment instructions shown on invoices.</p>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Link href="/dashboard" className="btn-secondary-theme no-underline">Back to dashboard</Link>
          </div>
        </div>

        {error && <div className="rounded-xl border border-red-500/50 bg-red-900/20 px-4 py-3 text-red-200">{error}</div>}

        <div className="card-theme space-y-5 text-left">
          {loading ? (
            <div className="text-secondary">Loading settings…</div>
          ) : (
            <>
              <h2 className="text-xl font-semibold text-accent-theme">Invoice payment instructions</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="label-theme">Beneficiary name</label>
                  <input className="input-field-theme" value={settings.beneficiary_name || ''} onChange={(e) => setSettings((s) => ({ ...s, beneficiary_name: e.target.value }))} />
                </div>
                <div>
                  <label className="label-theme">Bank name</label>
                  <input className="input-field-theme" value={settings.bank_name || ''} onChange={(e) => setSettings((s) => ({ ...s, bank_name: e.target.value }))} />
                </div>
                <div>
                  <label className="label-theme">Account number</label>
                  <input className="input-field-theme" value={settings.account_number || ''} onChange={(e) => setSettings((s) => ({ ...s, account_number: e.target.value }))} />
                </div>
                <div>
                  <label className="label-theme">Branch</label>
                  <input className="input-field-theme" value={settings.branch_name || ''} onChange={(e) => setSettings((s) => ({ ...s, branch_name: e.target.value }))} />
                </div>
                <div>
                  <label className="label-theme">SWIFT</label>
                  <input className="input-field-theme" value={settings.swift_code || ''} onChange={(e) => setSettings((s) => ({ ...s, swift_code: e.target.value }))} />
                </div>
                <div>
                  <label className="label-theme">IBAN</label>
                  <input className="input-field-theme" value={settings.iban || ''} onChange={(e) => setSettings((s) => ({ ...s, iban: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="label-theme">Payment reference note</label>
                <input className="input-field-theme" value={settings.payment_reference_note || ''} onChange={(e) => setSettings((s) => ({ ...s, payment_reference_note: e.target.value }))} />
              </div>
              <div>
                <label className="label-theme">Additional instruction note</label>
                <textarea className="input-field-theme min-h-[90px]" value={settings.instructions_note || ''} onChange={(e) => setSettings((s) => ({ ...s, instructions_note: e.target.value }))} />
              </div>

              <div className="rounded-xl border border-accent bg-inner-theme p-4">
                <p className="text-sm font-semibold text-accent-theme mb-3">Client-visible fields</p>
                <div className="grid sm:grid-cols-2 gap-2 text-sm">
                  {Object.entries(settings.visible_fields || {}).map(([key, value]) => (
                    <label key={key} className="flex items-center gap-2 text-secondary">
                      <input
                        type="checkbox"
                        checked={!!value}
                        onChange={(e) =>
                          setSettings((s) => ({
                            ...s,
                            visible_fields: { ...s.visible_fields, [key]: e.target.checked },
                          }))
                        }
                      />
                      {key.replace(/_/g, ' ')}
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex gap-3">
                <button type="button" className="btn-primary-theme" onClick={() => void save()} disabled={saving}>
                  {saving ? 'Saving…' : 'Save payment instructions'}
                </button>
                <button type="button" className="btn-secondary-theme" onClick={() => void load()} disabled={saving}>
                  Reset
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
