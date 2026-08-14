'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { consoleFetch } from '@/lib/console-api'

const empty = {
  client_name: '',
  email: '',
  whatsapp: '',
  origin_country: '',
  start_date: '',
  end_date: '',
  number_of_adults: 2,
  number_of_children: 0,
  children_ages: '' as string,
  requested_destinations: '',
  interests: '',
  budget: '',
  hotel_preference: '',
  vehicle_preference: '',
  special_requirements: '',
  arrival_flight: '',
  departure_flight: '',
  assigned_employee: '',
  lead_source: '',
  notes: '',
  additional_preferences: '',
}

export default function NewRequestPage() {
  const router = useRouter()
  const [form, setForm] = useState(empty)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const duration = useMemo(() => {
    if (!form.start_date || !form.end_date) return null
    const a = new Date(`${form.start_date}T00:00:00`)
    const b = new Date(`${form.end_date}T00:00:00`)
    if (b < a) return null
    return Math.floor((b.getTime() - a.getTime()) / 86400000) + 1
  }, [form.start_date, form.end_date])

  function set<K extends keyof typeof empty>(k: K, v: (typeof empty)[K]) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  async function save() {
    setError(null)
    setSaving(true)
    try {
      const ages = form.children_ages
        .split(',')
        .map((x) => parseInt(x.trim(), 10))
        .filter((n) => Number.isFinite(n))
      const json = await consoleFetch('/api/v2/requests', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          number_of_adults: Number(form.number_of_adults),
          number_of_children: Number(form.number_of_children),
          children_ages: ages,
        }),
      })
      router.push(`/console/requests/${json.request.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save request')
      setSaving(false)
    }
  }

  return (
    <div>
      <h1 className="ll-h1">New request</h1>
      <p className="ll-sub">IDs continue as req-id-001, req-id-002… to stay compatible with existing data.</p>
      {error && <div className="ll-error">{error}</div>}
      <div className="ll-form">
        <label>Client name<input value={form.client_name} onChange={(e) => set('client_name', e.target.value)} /></label>
        <label>Email<input value={form.email} onChange={(e) => set('email', e.target.value)} /></label>
        <label>Phone / WhatsApp<input value={form.whatsapp} onChange={(e) => set('whatsapp', e.target.value)} /></label>
        <label>Country<input value={form.origin_country} onChange={(e) => set('origin_country', e.target.value)} /></label>
        <div className="ll-row">
          <label>Arrival<input type="date" value={form.start_date} onChange={(e) => set('start_date', e.target.value)} /></label>
          <label>Departure<input type="date" value={form.end_date} onChange={(e) => set('end_date', e.target.value)} /></label>
          <label>Duration<input readOnly value={duration ? `${duration} days` : ''} /></label>
        </div>
        <label>Arrival flight<input value={form.arrival_flight} onChange={(e) => set('arrival_flight', e.target.value)} /></label>
        <label>Departure flight<input value={form.departure_flight} onChange={(e) => set('departure_flight', e.target.value)} /></label>
        <div className="ll-row">
          <label>Adults<input type="number" min={1} value={form.number_of_adults} onChange={(e) => set('number_of_adults', Number(e.target.value) as never)} /></label>
          <label>Children<input type="number" min={0} value={form.number_of_children} onChange={(e) => set('number_of_children', Number(e.target.value) as never)} /></label>
        </div>
        <label>Children&apos;s ages (comma separated)<input value={form.children_ages} onChange={(e) => set('children_ages', e.target.value)} placeholder="8, 11" /></label>
        <label>Requested destinations<input value={form.requested_destinations} onChange={(e) => set('requested_destinations', e.target.value)} placeholder="Sigiriya → Kandy → Ella → Yala → Mirissa" /></label>
        <label>Interests<textarea value={form.interests} onChange={(e) => set('interests', e.target.value)} /></label>
        <label>Budget<input value={form.budget} onChange={(e) => set('budget', e.target.value)} /></label>
        <label>Hotel preference<input value={form.hotel_preference} onChange={(e) => set('hotel_preference', e.target.value)} /></label>
        <label>Vehicle preference<input value={form.vehicle_preference} onChange={(e) => set('vehicle_preference', e.target.value)} /></label>
        <label>Special requirements<textarea value={form.special_requirements} onChange={(e) => set('special_requirements', e.target.value)} /></label>
        <label>Assigned employee<input value={form.assigned_employee} onChange={(e) => set('assigned_employee', e.target.value)} /></label>
        <label>Lead source<input value={form.lead_source} onChange={(e) => set('lead_source', e.target.value)} /></label>
        <label>Internal notes<textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} /></label>
        <button className="ll-btn" disabled={saving} onClick={save}>
          {saving ? 'Saving…' : 'Save request'}
        </button>
      </div>
    </div>
  )
}
