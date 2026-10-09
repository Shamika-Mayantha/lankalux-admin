'use client'

import { useRef, useState } from 'react'
import { consoleFetch, useConsoleGet } from '@/lib/console-api'
import { allLibraryImages } from '@/services/image-map.service'
import type { HotelRecord } from '@/types/domain'

const blank: Partial<HotelRecord> & { name: string } = {
  name: '',
  destination: '',
  star_category: '5',
  description: '',
  room_category: '',
  meal_plan: '',
  price_internal: '',
  website: '',
  contact: '',
  internal_notes: '',
  images: [],
  active: true,
}

export default function HotelsPage() {
  const { data, error: loadError, loading, reload } = useConsoleGet<{ hotels?: HotelRecord[] }>('/api/v2/hotels')
  const hotels = data?.hotels || []
  const [form, setForm] = useState(blank)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const formRef = useRef<HTMLDivElement>(null)
  const library = allLibraryImages()
  const editing = Boolean(form.id)

  function edit(h: HotelRecord) {
    setForm(h)
    setNotice(null)
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  async function save() {
    if (!form.name.trim()) {
      setError('Add a hotel name first.')
      return
    }
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      await consoleFetch('/api/v2/hotels', { method: 'POST', body: JSON.stringify(form) })
      setNotice(`${form.name} ${editing ? 'updated' : 'saved'}.`)
      setForm(blank)
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <h1 className="ll-h1">Hotels</h1>
      <p className="ll-sub">Catalogue stays that can be attached to a journey.</p>
      {(error || loadError) && <div className="ll-error">{error || loadError}</div>}
      {notice && <div className="ll-ok">{notice}</div>}
      <div className="ll-form" style={{ marginBottom: 28, scrollMarginTop: 90 }} ref={formRef}>
        {editing ? <p className="ll-muted">Editing {form.name || 'hotel'}</p> : null}
        <label>Hotel name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
        <label>Destination<input value={form.destination || ''} onChange={(e) => setForm({ ...form, destination: e.target.value })} /></label>
        <label>
          Category
          <select value={form.star_category || '5'} onChange={(e) => setForm({ ...form, star_category: e.target.value })}>
            <option>3</option>
            <option>4</option>
            <option>5</option>
            <option>Boutique</option>
          </select>
        </label>
        <label>Room category<input value={form.room_category || ''} onChange={(e) => setForm({ ...form, room_category: e.target.value })} /></label>
        <label>Meal plan<input value={form.meal_plan || ''} onChange={(e) => setForm({ ...form, meal_plan: e.target.value })} /></label>
        <label>Internal cost<input value={form.price_internal || ''} onChange={(e) => setForm({ ...form, price_internal: e.target.value })} /></label>
        <label>Website<input value={form.website || ''} onChange={(e) => setForm({ ...form, website: e.target.value })} /></label>
        <label>Contact<input value={form.contact || ''} onChange={(e) => setForm({ ...form, contact: e.target.value })} /></label>
        <label>Description<textarea value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
        <label>
          Image
          <select
            value={form.images?.[0] || ''}
            onChange={(e) => setForm({ ...form, images: e.target.value ? [e.target.value] : [] })}
          >
            <option value="">None</option>
            {library.map((src) => (
              <option key={src} value={src}>
                {src}
              </option>
            ))}
          </select>
        </label>
        <div className="ll-row">
          <button className="ll-btn" disabled={saving} onClick={save}>
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Save hotel'}
          </button>
          {editing ? (
            <button className="ll-btn secondary" disabled={saving} onClick={() => setForm(blank)}>
              Cancel
            </button>
          ) : null}
        </div>
      </div>
      {loading && <p className="ll-muted">Loading hotels…</p>}
      {!loading && hotels.length === 0 && <p className="ll-muted">No hotels in the catalogue yet.</p>}
      <div className="ll-grid">
        {hotels.map((h) => (
          <div className="ll-card" key={h.id}>
            <h3>{h.destination || 'Stay'}</h3>
            <p className="ll-card-title">{h.name}</p>
            <p className="ll-muted">
              {h.star_category} · {h.room_category} · {h.active ? 'Active' : 'Inactive'}
            </p>
            <button className="ll-btn secondary" onClick={() => edit(h)}>
              Edit
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
