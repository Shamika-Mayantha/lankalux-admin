'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { consoleFetch } from '@/lib/console-api'
import { STYLE_META, STATUS_LABEL, REQUEST_STATUSES, normalizeStatus, type ItineraryStyle } from '@/config/status'
import { BRAND } from '@/config/brand'
import { allLibraryImages } from '@/services/image-map.service'
import { JourneyView } from '@/features/journey/JourneyView'
import '@/features/journey/journey.css'
import type { ActivityEvent, CanonicalJourney, ClientRequestRow, ItineraryDay, ItineraryRecord, StructuredItinerary, VehicleRecord } from '@/types/domain'

const EMPTY_TRAVEL = { from: '', to: '', estimated_distance: '', estimated_duration: '' }

function emptyDay(n: number): ItineraryDay {
  return {
    day: n,
    date: '',
    location: '',
    overnight_location: '',
    title: '',
    description: '',
    activities: [],
    optional_activities: [],
    travel: { ...EMPTY_TRAVEL },
    recommended_images: [],
  }
}

export function RequestWorkspace() {
  const params = useParams<{ id: string }>()
  const id = params.id
  const [row, setRow] = useState<ClientRequestRow | null>(null)
  const [itineraries, setItineraries] = useState<ItineraryRecord[]>([])
  const [activity, setActivity] = useState<ActivityEvent[]>([])
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<'overview' | 'itineraries' | 'editor' | 'activity'>('overview')
  const [generating, setGenerating] = useState<Record<number, boolean>>({})
  const [genError, setGenError] = useState<Record<number, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [editOption, setEditOption] = useState<1 | 2 | 3>(1)
  const [draft, setDraft] = useState<StructuredItinerary | null>(null)
  const [preview, setPreview] = useState<CanonicalJourney | null>(null)
  const [emailOpen, setEmailOpen] = useState(false)
  const [waOpen, setWaOpen] = useState(false)
  const [emailIntro, setEmailIntro] = useState('')
  const [includeHotels, setIncludeHotels] = useState(false)
  const [waMessage, setWaMessage] = useState('')
  const [waHref, setWaHref] = useState('')
  const [vehicles, setVehicles] = useState<VehicleRecord[]>([])
  const [notice, setNotice] = useState<string | null>(null)

  async function reload() {
    const json = await consoleFetch(`/api/v2/requests/${id}`)
    setRow(json.request)
    setItineraries(json.itineraries || [])
    setActivity(json.activity || [])
  }

  useEffect(() => {
    if (!id) return
    reload().catch((e) => setError(e.message))
    consoleFetch('/api/v2/vehicles')
      .then((d) => setVehicles(d.vehicles || []))
      .catch(() => {})
  }, [id])

  useEffect(() => {
    const current = itineraries.find((i) => i.option_number === editOption)
    if (current?.payload) setDraft(JSON.parse(JSON.stringify(current.payload)))
  }, [editOption, itineraries])

  const selected = itineraries.find((i) => i.is_selected)

  async function generate(n: 1 | 2 | 3, style: ItineraryStyle) {
    setGenError((e) => ({ ...e, [n]: '' }))
    setGenerating((g) => ({ ...g, [n]: true }))
    try {
      await consoleFetch('/api/v2/generate', {
        method: 'POST',
        body: JSON.stringify({ requestId: id, itineraryNumber: n, style }),
      })
      await reload()
    } catch (e) {
      setGenError((er) => ({ ...er, [n]: e instanceof Error ? e.message : 'Generation failed' }))
    } finally {
      setGenerating((g) => ({ ...g, [n]: false }))
    }
  }

  async function generateAll() {
    await Promise.allSettled([
      generate(1, 'balanced'),
      generate(2, 'relaxed'),
      generate(3, 'experience'),
    ])
  }

  async function selectOption(n: 1 | 2 | 3) {
    setBusy('Selecting…')
    setError(null)
    try {
      await consoleFetch(`/api/v2/requests/${id}/itinerary`, {
        method: 'POST',
        body: JSON.stringify({ action: 'select', optionNumber: n }),
      })
      await reload()
      setNotice(`Option ${n} is now the selected itinerary.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Select failed')
    } finally {
      setBusy(null)
    }
  }

  async function saveDraft() {
    if (!draft) return
    setBusy('Saving…')
    setError(null)
    try {
      await consoleFetch(`/api/v2/requests/${id}/itinerary`, {
        method: 'POST',
        body: JSON.stringify({ action: 'save', optionNumber: editOption, payload: draft }),
      })
      await reload()
      setNotice('Itinerary saved.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setBusy(null)
    }
  }

  async function saveField(patch: Record<string, unknown>) {
    setBusy('Saving…')
    try {
      const json = await consoleFetch(`/api/v2/requests/${id}`, { method: 'PATCH', body: JSON.stringify(patch) })
      setRow(json.request)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setBusy(null)
    }
  }

  async function openEmail() {
    setEmailIntro(
      `We are delighted to share your personalised Sri Lanka journey. Every day has been paced with care so you can travel beautifully, not hurriedly.`
    )
    setEmailOpen(true)
  }

  async function sendEmail() {
    setBusy('Sending email…')
    setError(null)
    try {
      const json = await consoleFetch('/api/v2/email', {
        method: 'POST',
        body: JSON.stringify({
          requestId: id,
          introduction: emailIntro,
          includeHotels,
          includeItinerary: true,
        }),
      })
      setEmailOpen(false)
      setNotice(`Email sent to ${json.to}.`)
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Email failed')
    } finally {
      setBusy(null)
    }
  }

  async function openWhatsApp() {
    setBusy('Creating share link…')
    setError(null)
    try {
      const json = await consoleFetch('/api/v2/whatsapp', { method: 'POST', body: JSON.stringify({ requestId: id }) })
      setWaMessage(json.message)
      setWaHref(json.href)
      setWaOpen(true)
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'WhatsApp failed')
    } finally {
      setBusy(null)
    }
  }

  const previewJourney: CanonicalJourney | null = useMemo(() => {
    if (!row || !draft) return null
    const rec = itineraries.find((i) => i.option_number === editOption)
    const vehicle = vehicles.find((v) => v.id === (draft.vehicle_id || rec?.vehicle_id || ''))
    return {
      requestId: row.id,
      clientName: row.client_name || 'Guest',
      email: row.email,
      whatsapp: row.whatsapp,
      title: draft.title,
      summary: draft.summary,
      startDate: row.start_date,
      endDate: row.end_date,
      durationDays: row.duration,
      durationLabel: draft.duration,
      party: {
        adults: row.number_of_adults || 0,
        children: row.number_of_children || 0,
        childrenAges: [],
      },
      days: draft.days,
      vehicle: vehicle ? { id: vehicle.id, name: vehicle.name, description: vehicle.description || '', photos: vehicle.photos } : null,
      hotels: [],
      includedServices: BRAND.includedServices,
      importantInformation: BRAND.importantInformation,
    }
  }, [row, draft, itineraries, editOption, vehicles])

  if (error && !row) return <div className="ll-error">{error}</div>
  if (!row) return <p>Loading request…</p>

  const status = normalizeStatus(row.status) || 'new'

  return (
    <div>
      <div className="ll-row" style={{ justifyContent: 'space-between' }}>
        <div>
          <p className="ll-muted">{row.id}</p>
          <h1 className="ll-h1">{row.client_name}</h1>
          <p className="ll-sub">
            {row.start_date} → {row.end_date} · {row.duration || '—'} days
          </p>
        </div>
        <div className="ll-row">
          <span className={`ll-pill ${status}`}>{STATUS_LABEL[status]}</span>
          <button className="ll-btn secondary" disabled={!!busy || !selected} onClick={openEmail}>
            Send email
          </button>
          <button className="ll-btn wa" disabled={!!busy || !selected} onClick={openWhatsApp}>
            WhatsApp
          </button>
          <button
            className="ll-btn secondary"
            disabled={!selected}
            onClick={async () => {
              try {
                const json = await consoleFetch(`/api/v2/requests/${id}/published`)
                setPreview(json.journey)
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Preview failed')
              }
            }}
          >
            Client preview
          </button>
        </div>
      </div>
      {busy && <p className="ll-muted">{busy}</p>}
      {notice && <div className="ll-ok">{notice}</div>}
      {error && <div className="ll-error">{error}</div>}

      <div className="ll-tabs">
        {(['overview', 'itineraries', 'editor', 'activity'] as const).map((t) => (
          <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="ll-form">
          <div className="ll-row">
            <label>
              Status
              <select value={status} onChange={(e) => saveField({ status: e.target.value })}>
                {REQUEST_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </label>
            {status === 'cancelled' && (
              <button className="ll-btn secondary" onClick={() => saveField({ restore: true })}>
                Restore
              </button>
            )}
          </div>
          <label>Email<input defaultValue={row.email || ''} onBlur={(e) => saveField({ email: e.target.value })} /></label>
          <label>WhatsApp<input defaultValue={row.whatsapp || ''} onBlur={(e) => saveField({ whatsapp: e.target.value })} /></label>
          <label>Country<input defaultValue={row.origin_country || ''} onBlur={(e) => saveField({ origin_country: e.target.value })} /></label>
          <label>Assigned employee<input defaultValue={row.assigned_employee || ''} onBlur={(e) => saveField({ assigned_employee: e.target.value })} /></label>
          <label>Lead source<input defaultValue={row.lead_source || ''} onBlur={(e) => saveField({ lead_source: e.target.value })} /></label>
          <label>Destinations<input defaultValue={row.requested_destinations || ''} onBlur={(e) => saveField({ requested_destinations: e.target.value })} /></label>
          <label>Interests<textarea defaultValue={row.interests || row.additional_preferences || ''} onBlur={(e) => saveField({ interests: e.target.value })} /></label>
          <label>Internal notes<textarea defaultValue={row.notes || ''} onBlur={(e) => saveField({ notes: e.target.value })} /></label>
        </div>
      )}

      {tab === 'itineraries' && (
        <div>
          <div className="ll-row" style={{ marginBottom: 16 }}>
            <button className="ll-btn" disabled={Object.values(generating).some(Boolean)} onClick={generateAll}>
              Generate itineraries
            </button>
            <span className="ll-muted">Each option is a separate job. A failure will not erase the others.</span>
          </div>
          <div className="ll-option-grid">
            {([1, 2, 3] as const).map((n) => {
              const style = (['balanced', 'relaxed', 'experience'] as const)[n - 1]
              const rec = itineraries.find((i) => i.option_number === n)
              const loading = !!generating[n]
              return (
                <div key={n} className={`ll-option ${rec?.is_selected ? 'selected' : ''}`}>
                  <p className="ll-muted">{STYLE_META[style].label}</p>
                  <h3>{STYLE_META[style].subtitle}</h3>
                  {loading && <p>Generating itinerary {n}…</p>}
                  {!loading && rec?.status === 'failed' && <div className="ll-error">{genError[n] || rec.error || 'Failed'}</div>}
                  {!loading && rec?.payload?.days?.length ? (
                    <>
                      <strong>{rec.title}</strong>
                      <p className="ll-muted">{rec.summary}</p>
                      <p className="ll-muted">{rec.payload.days.length} days · {rec.payload.days.map((d) => d.location).filter(Boolean).join(' → ')}</p>
                    </>
                  ) : (
                    !loading && <p className="ll-muted">Not generated yet.</p>
                  )}
                  {genError[n] && rec?.status !== 'failed' && <div className="ll-error">{genError[n]}</div>}
                  <div className="ll-row" style={{ marginTop: 'auto' }}>
                    <button className="ll-btn secondary" disabled={loading} onClick={() => generate(n, style)}>
                      {rec?.payload?.days?.length ? 'Regenerate' : 'Generate'}
                    </button>
                    <button className="ll-btn secondary" disabled={!rec?.payload?.days?.length} onClick={() => { setEditOption(n); setTab('editor') }}>
                      Edit
                    </button>
                    <button className="ll-btn" disabled={!rec?.payload?.days?.length || loading} onClick={() => selectOption(n)}>
                      {rec?.is_selected ? 'Selected' : 'Select'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {tab === 'editor' && draft && (
        <Editor
          draft={draft}
          setDraft={setDraft}
          option={editOption}
          setOption={setEditOption}
          vehicles={vehicles}
          onSave={saveDraft}
          busy={!!busy}
          onPreview={() => previewJourney && setPreview(previewJourney)}
        />
      )}

      {tab === 'activity' && (
        <table className="ll-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Event</th>
              <th>User</th>
            </tr>
          </thead>
          <tbody>
            {activity.map((a, i) => (
              <tr key={a.id || i}>
                <td>{a.created_at ? new Date(a.created_at).toLocaleString() : ''}</td>
                <td>{a.event_type}</td>
                <td>{a.actor || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {emailOpen && (
        <div className="ll-modal-back" onClick={() => setEmailOpen(false)}>
          <div className="ll-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Send email</h2>
            <p className="ll-muted">The itinerary itself is the saved selected journey — it is not regenerated.</p>
            <div className="ll-form">
              <label>To<input readOnly value={row.email || ''} /></label>
              <label>
                Introduction
                <textarea rows={6} value={emailIntro} onChange={(e) => setEmailIntro(e.target.value)} />
              </label>
              <label>
                <input type="checkbox" checked={includeHotels} onChange={(e) => setIncludeHotels(e.target.checked)} /> Include hotels
              </label>
              <div className="ll-row">
                <button className="ll-btn" disabled={!!busy} onClick={sendEmail}>
                  {busy ? 'Sending email…' : 'Send'}
                </button>
                <button className="ll-btn secondary" onClick={() => setEmailOpen(false)}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {waOpen && (
        <div className="ll-modal-back" onClick={() => setWaOpen(false)}>
          <div className="ll-modal" onClick={(e) => e.stopPropagation()}>
            <h2>WhatsApp preview</h2>
            <p className="ll-muted">This text is built from the selected saved itinerary.</p>
            <textarea rows={16} value={waMessage} onChange={(e) => setWaMessage(e.target.value)} />
            <div className="ll-row" style={{ marginTop: 12 }}>
              <a className="ll-btn wa" href={`https://wa.me/${waHref.split('wa.me/')[1]?.split('?')[0] || ''}?text=${encodeURIComponent(waMessage)}`} target="_blank" rel="noreferrer">
                Open WhatsApp
              </a>
              <button className="ll-btn secondary" onClick={() => setWaOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {preview && (
        <div className="ll-modal-back" onClick={() => setPreview(null)}>
          <div className="ll-modal" style={{ maxWidth: 820, padding: 0 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: 12, textAlign: 'right' }}>
              <button className="ll-btn secondary" onClick={() => setPreview(null)}>
                Close preview
              </button>
            </div>
            <JourneyView journey={preview} />
          </div>
        </div>
      )}
    </div>
  )
}

function Editor({
  draft,
  setDraft,
  option,
  setOption,
  vehicles,
  onSave,
  busy,
  onPreview,
}: {
  draft: StructuredItinerary
  setDraft: (d: StructuredItinerary) => void
  option: 1 | 2 | 3
  setOption: (n: 1 | 2 | 3) => void
  vehicles: VehicleRecord[]
  onSave: () => void
  busy: boolean
  onPreview: () => void
}) {
  const library = allLibraryImages()

  function patchDay(i: number, patch: Partial<ItineraryDay>) {
    const days = draft.days.map((d, idx) => (idx === i ? { ...d, ...patch } : d))
    setDraft({ ...draft, days })
  }

  function moveDay(i: number, dir: -1 | 1) {
    const j = i + dir
    if (j < 0 || j >= draft.days.length) return
    const days = [...draft.days]
    const tmp = days[i]
    days[i] = days[j]
    days[j] = tmp
    setDraft({ ...draft, days: days.map((d, idx) => ({ ...d, day: idx + 1 })) })
  }

  return (
    <div>
      <div className="ll-row" style={{ marginBottom: 12 }}>
        {([1, 2, 3] as const).map((n) => (
          <button key={n} className={`ll-btn ${option === n ? '' : 'secondary'}`} onClick={() => setOption(n)}>
            Option {n}
          </button>
        ))}
        <button className="ll-btn" disabled={busy} onClick={onSave}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button className="ll-btn secondary" onClick={onPreview}>
          Preview
        </button>
      </div>
      <div className="ll-form">
        <label>
          Title
          <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
        </label>
        <label>
          Summary
          <textarea value={draft.summary} onChange={(e) => setDraft({ ...draft, summary: e.target.value })} />
        </label>
        <label>
          Vehicle
          <select
            value={draft.vehicle_id || ''}
            onChange={(e) => setDraft({ ...draft, vehicle_id: e.target.value || null })}
          >
            <option value="">None</option>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Internal notes
          <textarea value={draft.internal_notes || ''} onChange={(e) => setDraft({ ...draft, internal_notes: e.target.value })} />
        </label>
      </div>
      {draft.days.map((day, i) => (
        <div key={i} className="ll-card" style={{ marginTop: 14 }}>
          <div className="ll-row" style={{ justifyContent: 'space-between' }}>
            <strong>Day {day.day}</strong>
            <div className="ll-row">
              <button className="ll-btn ghost" onClick={() => moveDay(i, -1)}>
                Up
              </button>
              <button className="ll-btn ghost" onClick={() => moveDay(i, 1)}>
                Down
              </button>
              <button
                className="ll-btn ghost"
                onClick={() => setDraft({ ...draft, days: draft.days.filter((_, idx) => idx !== i).map((d, idx) => ({ ...d, day: idx + 1 })) })}
              >
                Delete day
              </button>
            </div>
          </div>
          <div className="ll-form" style={{ marginTop: 10 }}>
            <label>
              Title
              <input value={day.title} onChange={(e) => patchDay(i, { title: e.target.value })} />
            </label>
            <label>
              Location
              <input value={day.location} onChange={(e) => patchDay(i, { location: e.target.value })} />
            </label>
            <label>
              Overnight
              <input value={day.overnight_location} onChange={(e) => patchDay(i, { overnight_location: e.target.value })} />
            </label>
            <label>
              Date
              <input value={day.date} onChange={(e) => patchDay(i, { date: e.target.value })} />
            </label>
            <label>
              Description
              <textarea value={day.description} onChange={(e) => patchDay(i, { description: e.target.value })} />
            </label>
            <label>
              Activities (one per line)
              <textarea
                value={day.activities.join('\n')}
                onChange={(e) => patchDay(i, { activities: e.target.value.split('\n').filter((x) => x.trim()) })}
              />
            </label>
            <label>
              Image
              <select
                value={day.recommended_images[0] || ''}
                onChange={(e) => patchDay(i, { recommended_images: e.target.value ? [e.target.value] : [] })}
              >
                <option value="">Auto / none</option>
                {library.map((src) => (
                  <option key={src} value={src}>
                    {src.replace('/images/', '')}
                  </option>
                ))}
              </select>
            </label>
            {day.recommended_images[0] && (
              <img src={day.recommended_images[0]} alt="" className="ll-thumb" style={{ maxHeight: 160, height: 160 }} />
            )}
          </div>
        </div>
      ))}
      <button
        className="ll-btn secondary"
        style={{ marginTop: 12 }}
        onClick={() => setDraft({ ...draft, days: [...draft.days, emptyDay(draft.days.length + 1)] })}
      >
        Add a day
      </button>
    </div>
  )
}
