'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { consoleFetch } from '@/lib/console-api'
import { STYLE_META, STATUS_LABEL, REQUEST_STATUSES, normalizeStatus, type ItineraryStyle } from '@/config/status'
import { BRAND } from '@/config/brand'
import { allLibraryImages } from '@/services/image-map.service'
import { formatKilometers, totalKilometersFor } from '@/services/kilometers.service'
import { JourneyView } from '@/features/journey/JourneyView'
import { PhotoPicker } from '@/features/console/PhotoPicker'
import { InvoiceWorkspace } from '@/features/invoices/InvoiceWorkspace'
import '@/features/journey/journey.css'
import type { ActivityEvent, CanonicalJourney, ClientRequestRow, ItineraryDay, ItineraryRecord, StructuredItinerary, VehicleRecord } from '@/types/domain'
import {
  FOLLOW_UP_TEMPLATES,
  buildHtmlFromBody,
  followUpCta,
  getTemplate,
  type TemplateId,
} from '@/lib/email-templates'

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

type OverviewDraft = {
  status: string
  start_date: string
  end_date: string
  email: string
  whatsapp: string
  origin_country: string
  assigned_employee: string
  lead_source: string
  requested_destinations: string
  interests: string
  notes: string
  number_of_adults: number
  number_of_children: number
  children_ages: string
}

function parseAgeList(raw: string | number[] | null | undefined): number[] {
  if (raw == null || raw === '') return []
  if (Array.isArray(raw)) return raw.map((n) => parseInt(String(n), 10)).filter((n) => Number.isFinite(n) && n >= 0)
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      return parsed.map((n) => parseInt(String(n), 10)).filter((n) => Number.isFinite(n) && n >= 0)
    }
  } catch {
    // Comma-separated ages from the overview form.
  }
  return String(raw)
    .split(',')
    .map((x) => parseInt(x.trim(), 10))
    .filter((n) => Number.isFinite(n) && n >= 0)
}

function partyCounts(adults: number | null | undefined, children: number | null | undefined, agesRaw: string | number[] | null | undefined) {
  const ages = parseAgeList(agesRaw)
  const adultCount = Math.max(0, adults || 0)
  const childCount = Math.max(0, children || ages.length || 0)
  return { adults: adultCount, children: childCount, ages, total: adultCount + childCount }
}

function partySummary(adults: number, children: number, ages: number[]) {
  const total = adults + children
  const bits = [`${total} passenger${total === 1 ? '' : 's'}`, `${adults} adult${adults === 1 ? '' : 's'}`]
  if (children > 0) {
    const ageBit = ages.length ? ` (ages ${ages.join(', ')})` : ''
    bits.push(`${children} ${children === 1 ? 'child' : 'children'}${ageBit}`)
  }
  return bits.join(' · ')
}

type FollowUpSent = { sent_at: string; template_id: string; template_name: string; subject: string }

function parseFollowUpLog(raw: string | FollowUpSent[] | null | undefined): FollowUpSent[] {
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function templateDraft(templateId: TemplateId, clientName: string) {
  const template = getTemplate(templateId)
  const name = clientName || 'Valued Client'
  if (!template) return { subject: '', body: '' }
  if (templateId === 'custom_email') {
    const firstName = name.trim() ? name.split(' ')[0] : 'there'
    return { subject: template.subject || 'A note from LankaLux', body: `Dear ${firstName},\n\n` }
  }
  return { subject: template.subject, body: template.getText({ clientName: name, itineraryUrl: null }) }
}

function toOverviewDraft(row: ClientRequestRow): OverviewDraft {
  const party = partyCounts(row.number_of_adults, row.number_of_children, row.children_ages)
  return {
    status: normalizeStatus(row.status) || 'new',
    start_date: row.start_date || '',
    end_date: row.end_date || '',
    email: row.email || '',
    whatsapp: row.whatsapp || '',
    origin_country: row.origin_country || '',
    assigned_employee: row.assigned_employee || '',
    lead_source: row.lead_source || '',
    requested_destinations: row.requested_destinations || '',
    interests: row.interests || row.additional_preferences || '',
    notes: row.notes || '',
    number_of_adults: party.adults,
    number_of_children: party.children,
    children_ages: party.ages.join(', '),
  }
}

function durationFromDates(startDate: string, endDate: string): number | null {
  if (!startDate || !endDate) return null
  const start = new Date(`${startDate}T00:00:00`)
  const end = new Date(`${endDate}T00:00:00`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return null
  return Math.floor((end.getTime() - start.getTime()) / 86400000) + 1
}

function detailObject(detail: ActivityEvent['detail']): Record<string, unknown> | null {
  if (!detail || typeof detail !== 'object' || Array.isArray(detail)) return null
  return detail
}

function activityItineraryUrl(entry: ActivityEvent): string | null {
  const detail = detailObject(entry.detail)
  if (!detail) return null
  const direct =
    (typeof detail.url === 'string' && detail.url.trim()) ||
    (typeof detail.shareUrl === 'string' && detail.shareUrl.trim()) ||
    (typeof detail.itinerary_url === 'string' && detail.itinerary_url.trim()) ||
    (typeof detail.itineraryUrl === 'string' && detail.itineraryUrl.trim()) ||
    (typeof detail.share_url === 'string' && detail.share_url.trim()) ||
    null
  if (direct) return direct
  const token =
    (typeof detail.shareToken === 'string' && detail.shareToken.trim()) ||
    (typeof detail.share_token === 'string' && detail.share_token.trim()) ||
    (typeof detail.token === 'string' && detail.token.trim()) ||
    null
  if (!token) return null
  return `/journey/${encodeURIComponent(token)}`
}

function activityLabel(eventType: string) {
  const labels: Record<string, string> = {
    itinerary_link_opened: 'Client opened itinerary link',
    email_sent: 'Itinerary email sent',
    follow_up_email_sent: 'Follow-up email sent',
    whatsapp_shared: 'Itinerary shared on WhatsApp',
    invoice_created: 'Invoice created',
    invoice_edited: 'Invoice edited',
    invoice_finalized: 'Invoice finalized',
    invoice_downloaded: 'Invoice downloaded',
    invoice_sent: 'Invoice sent',
    payment_recorded: 'Payment recorded',
    payment_edited: 'Payment edited',
    payment_deleted: 'Payment deleted',
    invoice_marked_paid: 'Invoice marked paid',
    invoice_revised: 'Revised invoice created',
  }
  return labels[eventType] || eventType.replace(/_/g, ' ')
}

export function RequestWorkspace() {
  const params = useParams<{ id: string }>()
  const id = params.id
  const [row, setRow] = useState<ClientRequestRow | null>(null)
  const [itineraries, setItineraries] = useState<ItineraryRecord[]>([])
  const [activity, setActivity] = useState<ActivityEvent[]>([])
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<'overview' | 'itineraries' | 'editor' | 'invoices' | 'activity'>('overview')
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
  const [includeVehicle, setIncludeVehicle] = useState(false)
  const [sendVehicleId, setSendVehicleId] = useState('')
  const [includePrice, setIncludePrice] = useState(false)
  const [sendPrice, setSendPrice] = useState('')
  const [emailHtml, setEmailHtml] = useState<string | null>(null)
  const [waMessage, setWaMessage] = useState('')
  const [waHref, setWaHref] = useState('')
  const [vehicles, setVehicles] = useState<VehicleRecord[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const [overviewDraft, setOverviewDraft] = useState<OverviewDraft | null>(null)
  const [templateId, setTemplateId] = useState<TemplateId>('friendly_checkin')
  const [templateOpen, setTemplateOpen] = useState(false)
  const [templateSubject, setTemplateSubject] = useState('')
  const [templateBody, setTemplateBody] = useState('')

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

  useEffect(() => {
    if (!row) return
    setOverviewDraft(toOverviewDraft(row))
  }, [row])

  const selected = itineraries.find((i) => i.is_selected)
  const selectedVehicle = useMemo(() => {
    const vehicleId = selected?.vehicle_id || selected?.payload?.vehicle_id
    if (!vehicleId) return null
    return vehicles.find((v) => v.id === vehicleId) || null
  }, [selected, vehicles])
  const sendVehicle = useMemo(() => {
    if (!sendVehicleId) return null
    return vehicles.find((v) => v.id === sendVehicleId) || null
  }, [sendVehicleId, vehicles])
  const sendVehiclePayload = useMemo(
    () =>
      sendVehicle
        ? { id: sendVehicle.id, name: sendVehicle.name, description: sendVehicle.description || '', photos: sendVehicle.photos }
        : null,
    [sendVehicle]
  )
  const missingVehicleSelection = includeVehicle && !sendVehiclePayload

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

  async function patchRequest(patch: Record<string, unknown>) {
    setBusy('Saving…')
    setError(null)
    try {
      const json = await consoleFetch(`/api/v2/requests/${id}`, { method: 'PATCH', body: JSON.stringify(patch) })
      setRow(json.request)
      return json.request as ClientRequestRow
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
      return null
    } finally {
      setBusy(null)
    }
  }

  async function saveOverview() {
    if (!overviewDraft) return
    const ages = overviewDraft.number_of_children > 0 ? parseAgeList(overviewDraft.children_ages) : []
    const patch = {
      status: overviewDraft.status,
      start_date: overviewDraft.start_date || null,
      end_date: overviewDraft.end_date || null,
      email: overviewDraft.email || null,
      whatsapp: overviewDraft.whatsapp || null,
      origin_country: overviewDraft.origin_country || null,
      assigned_employee: overviewDraft.assigned_employee || null,
      lead_source: overviewDraft.lead_source || null,
      requested_destinations: overviewDraft.requested_destinations || null,
      interests: overviewDraft.interests || null,
      additional_preferences: overviewDraft.interests || null,
      notes: overviewDraft.notes || null,
      number_of_adults: overviewDraft.number_of_adults,
      number_of_children: overviewDraft.number_of_children,
      children_ages: ages,
    }
    const updated = await patchRequest(patch)
    if (updated) setNotice('Overview saved.')
  }

  function openTemplateEmail(nextId: TemplateId = templateId) {
    if (!row?.email) {
      setError('Client email is missing.')
      return
    }
    const draft = templateDraft(nextId, row.client_name || 'Valued Client')
    setTemplateId(nextId)
    setTemplateSubject(draft.subject)
    setTemplateBody(draft.body)
    setTemplateOpen(true)
  }

  async function sendTemplateEmail() {
    if (!row?.email) {
      setError('Client email is missing.')
      return
    }
    if (templateId === 'custom_email' && (!templateSubject.trim() || !templateBody.trim())) {
      setError('Please enter both a subject and a message before sending.')
      return
    }
    setBusy('Sending follow-up email…')
    setError(null)
    try {
      await consoleFetch('/api/v2/template-email', {
        method: 'POST',
        body: JSON.stringify({
          requestId: id,
          templateId,
          subject: templateSubject.trim() || undefined,
          body: templateBody.trim() || undefined,
        }),
      })
      setTemplateOpen(false)
      setNotice('Follow-up email sent.')
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Follow-up email failed')
    } finally {
      setBusy(null)
    }
  }

  async function openEmail() {
    setEmailIntro(
      `We are delighted to share your personalised LankaLux Journey. Every day has been paced with care so you can travel beautifully, not hurriedly.`
    )
    const savedPrice = selected?.payload?.price || row?.budget || ''
    setSendPrice(savedPrice)
    setSendVehicleId(selectedVehicle?.id || '')
    setIncludeVehicle(!!selectedVehicle)
    setIncludePrice(!!savedPrice)
    setEmailHtml(null)
    setEmailOpen(true)
  }

  function sendPayload() {
    return {
      requestId: id,
      introduction: emailIntro,
      includeHotels,
      includeVehicle: includeVehicle && !!sendVehiclePayload,
      vehicle: includeVehicle ? sendVehiclePayload : null,
      includeItinerary: true,
      includePrice,
      price: includePrice ? sendPrice.trim() : null,
    }
  }

  async function previewEmail() {
    setBusy('Preparing preview…')
    setError(null)
    try {
      const json = await consoleFetch('/api/v2/email', {
        method: 'POST',
        body: JSON.stringify({ ...sendPayload(), preview: true }),
      })
      setEmailHtml(json.html)
      if (json.journey) setPreview(json.journey)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Preview failed')
    } finally {
      setBusy(null)
    }
  }

  async function previewClientJourney() {
    setBusy('Loading preview…')
    setError(null)
    try {
      const json = await consoleFetch(`/api/v2/requests/${id}/published`)
      const sending = emailOpen || waOpen
      setPreview({
        ...json.journey,
        vehicle: sending
          ? includeVehicle
            ? sendVehiclePayload
            : null
          : json.journey.vehicle,
        price: sending
          ? includePrice && sendPrice.trim()
            ? sendPrice.trim()
            : null
          : json.journey.price || null,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Preview failed')
    } finally {
      setBusy(null)
    }
  }

  async function sendEmail() {
    setBusy('Sending email…')
    setError(null)
    try {
      const json = await consoleFetch('/api/v2/email', { method: 'POST', body: JSON.stringify(sendPayload()) })
      setEmailOpen(false)
      setEmailHtml(null)
      setNotice(`Email sent to ${json.to}.`)
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Email failed')
    } finally {
      setBusy(null)
    }
  }

  async function openWhatsApp() {
    const savedPrice = selected?.payload?.price || row?.budget || ''
    setSendPrice(savedPrice)
    setSendVehicleId(selectedVehicle?.id || '')
    setIncludeVehicle(!!selectedVehicle)
    setIncludePrice(!!savedPrice)
    setWaMessage('')
    setWaHref('')
    setWaOpen(true)
  }

  async function prepareWhatsApp() {
    setBusy('Creating share link…')
    setError(null)
    try {
      const json = await consoleFetch('/api/v2/whatsapp', {
        method: 'POST',
        body: JSON.stringify({
          requestId: id,
          includeVehicle: includeVehicle && !!sendVehiclePayload,
          vehicle: includeVehicle ? sendVehiclePayload : null,
          includePrice,
          price: includePrice ? sendPrice.trim() : null,
        }),
      })
      setWaMessage(json.message)
      setWaHref(json.href)
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
      party: (() => {
        const party = partyCounts(row.number_of_adults, row.number_of_children, row.children_ages)
        return { adults: party.adults, children: party.children, childrenAges: party.ages }
      })(),
      days: draft.days,
      vehicle: vehicle ? { id: vehicle.id, name: vehicle.name, description: vehicle.description || '', photos: vehicle.photos } : null,
      hotels: [],
      includedServices: BRAND.includedServices,
      importantInformation: BRAND.importantInformation,
      price: draft.price || null,
      totalKilometers: totalKilometersFor(draft.days),
    }
  }, [row, draft, itineraries, editOption, vehicles])

  if (error && !row) return <div className="ll-error">{error}</div>
  if (!row) return <p>Loading request…</p>

  const status = normalizeStatus(row.status) || 'new'
  const baselineOverview = toOverviewDraft(row)
  const overviewDirty =
    !!overviewDraft && JSON.stringify(overviewDraft) !== JSON.stringify(baselineOverview)
  const durationPreview =
    overviewDraft ? durationFromDates(overviewDraft.start_date, overviewDraft.end_date) : null
  const followUpSent = parseFollowUpLog(row.follow_up_emails_sent)
  const templateCta = followUpCta(templateId)
  const templatePreviewHtml =
    templateOpen && templateBody.trim()
      ? buildHtmlFromBody({
          clientName: row.client_name || 'Valued Client',
          bodyText: templateBody,
          logoUrl: `${typeof window !== 'undefined' ? window.location.origin : ''}${BRAND.logoSrc}`,
          ctaUrl: templateCta?.ctaUrl,
          ctaLabel: templateCta?.ctaLabel,
        })
      : null

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
          <button className="ll-btn secondary" disabled={!!busy || !selected || status === 'expired'} onClick={openEmail}>
            Send itinerary
          </button>
          <button className="ll-btn secondary" disabled={!!busy || !row.email} onClick={() => openTemplateEmail()}>
            Follow-up email
          </button>
          <button className="ll-btn wa" disabled={!!busy || !selected || status === 'expired'} onClick={openWhatsApp}>
            WhatsApp
          </button>
          <button
            className="ll-btn secondary"
            disabled={!selected}
            onClick={() => previewClientJourney()}
          >
            Preview
          </button>
          <button className="ll-btn secondary" disabled={!selected} onClick={() => setTab('invoices')}>
            Create invoice
          </button>
        </div>
      </div>
      {status === 'expired' && (
        <div className="ll-error">
          This request expired because the arrival date passed more than 3 days ago. Choose a new arrival date to reopen it.
        </div>
      )}
      {busy && <p className="ll-muted">{busy}</p>}
      {notice && <div className="ll-ok">{notice}</div>}
      {error && <div className="ll-error">{error}</div>}

      <div className="ll-tabs">
        {(
          [
            ['overview', 'Overview'],
            ['itineraries', 'Itineraries'],
            ['editor', 'Editor'],
            ['invoices', 'Invoices & Payments'],
            ['activity', 'Activity'],
          ] as const
        ).map(([id, label]) => (
          <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'overview' && overviewDraft && (
        <div className="ll-form">
          <div className="ll-card" style={{ maxWidth: 'none' }}>
            <h3>Invoice source</h3>
            <p className="ll-muted">The invoice uses this request. Nothing here is typed again on a separate form.</p>
            <div className="ll-grid-2" style={{ marginTop: 12 }}>
              <div>
                <p className="ll-muted" style={{ margin: 0 }}>Client</p>
                <p className="ll-card-title">{row.client_name || '—'}</p>
                <p className="ll-muted">{[row.email, row.whatsapp, row.origin_country].filter(Boolean).join(' · ') || '—'}</p>
                <p className="ll-muted">
                  {partySummary(
                    overviewDraft.number_of_adults,
                    overviewDraft.number_of_children,
                    parseAgeList(overviewDraft.children_ages)
                  )}
                </p>
              </div>
              <div>
                <p className="ll-muted" style={{ margin: 0 }}>Travel dates</p>
                <p className="ll-card-title">
                  {row.start_date || '—'} → {row.end_date || '—'}
                </p>
              </div>
              <div>
                <p className="ll-muted" style={{ margin: 0 }}>Selected itinerary</p>
                <p className="ll-card-title">{selected?.title || 'Not selected yet'}</p>
                <p className="ll-muted">
                  {selected?.payload?.days?.map((d) => d.location).filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(' · ') || 'Select an itinerary tab first'}
                </p>
              </div>
              <div>
                <p className="ll-muted" style={{ margin: 0 }}>Selected vehicle</p>
                <p className="ll-card-title">{selectedVehicle?.name || 'Not selected yet'}</p>
                <p className="ll-muted">{selectedVehicle?.description || 'Attach a vehicle on the selected itinerary.'}</p>
              </div>
              <div>
                <p className="ll-muted" style={{ margin: 0 }}>Chauffeur-Guide</p>
                <p className="ll-card-title">{overviewDraft.assigned_employee || 'Not assigned yet'}</p>
                <p className="ll-muted">LankaLux Chauffeur-Guide</p>
              </div>
            </div>
            <div className="ll-row" style={{ marginTop: 16 }}>
              <button className="ll-btn" disabled={!selected} onClick={() => setTab('invoices')}>
                Create invoice
              </button>
              <button className="ll-btn secondary" onClick={() => setTab('invoices')}>
                Open Invoices & Payments
              </button>
            </div>
          </div>
          <div className="ll-card" style={{ maxWidth: 'none' }}>
            <h3>Follow-up email</h3>
            <p className="ll-muted">
              Send a template or a custom note. Follow-up emails do not include an itinerary link.
            </p>
            {!row.email ? (
              <p className="ll-muted" style={{ marginTop: 12 }}>
                Add a client email on this overview before sending a template.
              </p>
            ) : (
              <div className="ll-row" style={{ marginTop: 12, alignItems: 'end' }}>
                <label style={{ minWidth: 260, flex: 1 }}>
                  Template
                  <select
                    value={templateId}
                    onChange={(e) => {
                      const next = e.target.value as TemplateId
                      setTemplateId(next)
                      const draft = templateDraft(next, row.client_name || 'Valued Client')
                      setTemplateSubject(draft.subject)
                      setTemplateBody(draft.body)
                    }}
                  >
                    {FOLLOW_UP_TEMPLATES.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button className="ll-btn" disabled={!!busy} onClick={() => openTemplateEmail(templateId)}>
                  Preview & send
                </button>
              </div>
            )}
            <div style={{ marginTop: 18 }}>
              <h3 style={{ marginBottom: 8 }}>Sent templates ({followUpSent.length})</h3>
              {followUpSent.length === 0 ? (
                <p className="ll-muted">No follow-up templates have been sent yet.</p>
              ) : (
                <ul className="ll-muted" style={{ margin: 0, paddingLeft: 18 }}>
                  {[...followUpSent]
                    .sort((a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime())
                    .map((entry, index) => (
                      <li key={`${entry.sent_at}-${index}`} style={{ marginBottom: 6 }}>
                        {new Date(entry.sent_at).toLocaleString()} · {entry.template_name}: {entry.subject}
                      </li>
                    ))}
                </ul>
              )}
            </div>
          </div>
          <div className="ll-row">
            <label>
              Status
              <select
                value={overviewDraft.status}
                onChange={(e) => setOverviewDraft({ ...overviewDraft, status: e.target.value })}
              >
                {REQUEST_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </label>
            {overviewDraft.status === 'cancelled' || overviewDraft.status === 'expired' ? (
              <button className="ll-btn secondary" onClick={() => patchRequest({ restore: true })}>
                Restore
              </button>
            ) : null}
          </div>
          <div className="ll-fields-2">
            <label>
              Arrival
              <input
                type="date"
                value={overviewDraft.start_date}
                onChange={(e) => setOverviewDraft({ ...overviewDraft, start_date: e.target.value })}
              />
            </label>
            <label>
              Departure
              <input
                type="date"
                value={overviewDraft.end_date}
                onChange={(e) => setOverviewDraft({ ...overviewDraft, end_date: e.target.value })}
              />
            </label>
          </div>
          <label>
            Duration
            <input
              readOnly
              value={
                durationPreview
                  ? `${durationPreview} days`
                  : row.duration
                  ? `${row.duration} days`
                  : 'Set arrival and departure'
              }
            />
          </label>
          <div className="ll-fields-2">
            <label>
              Adults
              <input
                type="number"
                min={0}
                value={overviewDraft.number_of_adults}
                onChange={(e) =>
                  setOverviewDraft({ ...overviewDraft, number_of_adults: Math.max(0, Number(e.target.value) || 0) })
                }
              />
            </label>
            <label>
              Children
              <input
                type="number"
                min={0}
                value={overviewDraft.number_of_children}
                onChange={(e) => {
                  const children = Math.max(0, Number(e.target.value) || 0)
                  setOverviewDraft({
                    ...overviewDraft,
                    number_of_children: children,
                    children_ages: children > 0 ? overviewDraft.children_ages : '',
                  })
                }}
              />
            </label>
          </div>
          <label>
            Total passengers
            <input
              readOnly
              value={`${overviewDraft.number_of_adults + overviewDraft.number_of_children} passenger${
                overviewDraft.number_of_adults + overviewDraft.number_of_children === 1 ? '' : 's'
              }`}
            />
          </label>
          {overviewDraft.number_of_children > 0 ? (
            <label>
              Children&apos;s ages
              <input
                value={overviewDraft.children_ages}
                onChange={(e) => setOverviewDraft({ ...overviewDraft, children_ages: e.target.value })}
                placeholder="8, 11"
              />
            </label>
          ) : null}
          <label>Email<input value={overviewDraft.email} onChange={(e) => setOverviewDraft({ ...overviewDraft, email: e.target.value })} /></label>
          <label>WhatsApp<input value={overviewDraft.whatsapp} onChange={(e) => setOverviewDraft({ ...overviewDraft, whatsapp: e.target.value })} /></label>
          <label>Country<input value={overviewDraft.origin_country} onChange={(e) => setOverviewDraft({ ...overviewDraft, origin_country: e.target.value })} /></label>
          <label>Chauffeur-Guide<input value={overviewDraft.assigned_employee} onChange={(e) => setOverviewDraft({ ...overviewDraft, assigned_employee: e.target.value })} /></label>
          <label>Lead source<input value={overviewDraft.lead_source} onChange={(e) => setOverviewDraft({ ...overviewDraft, lead_source: e.target.value })} /></label>
          <label>Destinations<input value={overviewDraft.requested_destinations} onChange={(e) => setOverviewDraft({ ...overviewDraft, requested_destinations: e.target.value })} /></label>
          <label>
            Interests
            <textarea
              rows={14}
              style={{ minHeight: 360 }}
              value={overviewDraft.interests}
              onChange={(e) => setOverviewDraft({ ...overviewDraft, interests: e.target.value })}
            />
          </label>
          <label>Internal notes<textarea value={overviewDraft.notes} onChange={(e) => setOverviewDraft({ ...overviewDraft, notes: e.target.value })} /></label>
          <div className="ll-row" style={{ justifyContent: 'flex-end' }}>
            <button
              className="ll-btn secondary"
              disabled={!overviewDirty || !!busy}
              onClick={() => setOverviewDraft(baselineOverview)}
            >
              Cancel changes
            </button>
            <button className="ll-btn" disabled={!overviewDirty || !!busy} onClick={saveOverview}>
              Save overview
            </button>
          </div>
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
                      <p className="ll-km">{formatKilometers(totalKilometersFor(rec.payload.days)) || '—'}</p>
                      <p className="ll-muted">
                        {rec.payload.days.length} days · {rec.payload.days.map((d) => d.location).filter(Boolean).join(' → ')}
                      </p>
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

      {tab === 'invoices' && (
        <InvoiceWorkspace requestId={id} requestEmail={row.email} compact />
      )}

      {tab === 'activity' && (
        <table className="ll-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Event</th>
              <th>Itinerary link</th>
              <th>User</th>
            </tr>
          </thead>
          <tbody>
            {activity.map((a, i) => {
              const url = activityItineraryUrl(a)
              return (
                <tr key={a.id || i}>
                  <td>{a.created_at ? new Date(a.created_at).toLocaleString() : ''}</td>
                  <td>{activityLabel(a.event_type)}</td>
                  <td>
                    {url ? (
                      <a href={url} target="_blank" rel="noreferrer">
                        Open link
                      </a>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>{a.actor || '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      {emailOpen && (
        <div className="ll-modal-back" onClick={() => setEmailOpen(false)}>
          <div className="ll-modal wide" onClick={(e) => e.stopPropagation()}>
            <h2>Send email</h2>
            <p className="ll-muted">The preview below uses the same template that is sent to the client.</p>
            <div className="ll-form">
              <label>To<input readOnly value={row.email || ''} /></label>
              <label>
                Introduction
                <textarea rows={5} value={emailIntro} onChange={(e) => setEmailIntro(e.target.value)} />
              </label>
              <label className="ll-check">
                <input type="checkbox" checked={includeHotels} onChange={(e) => setIncludeHotels(e.target.checked)} />
                Include hotels
              </label>
              <label className="ll-check">
                <input
                  type="checkbox"
                  checked={includeVehicle}
                  onChange={(e) => setIncludeVehicle(e.target.checked)}
                />
                Include vehicle
              </label>
              {includeVehicle ? (
                <label>
                  Vehicle shown to the client
                  <select value={sendVehicleId} onChange={(e) => setSendVehicleId(e.target.value)}>
                    <option value="">Select vehicle</option>
                    {vehicles.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              {missingVehicleSelection ? <p className="ll-muted">Please select a vehicle to include.</p> : null}
              <label className="ll-check">
                <input type="checkbox" checked={includePrice} onChange={(e) => setIncludePrice(e.target.checked)} />
                Include price
              </label>
              {includePrice && (
                <label>
                  Price shown to the client
                  <input
                    value={sendPrice}
                    onChange={(e) => setSendPrice(e.target.value)}
                    placeholder="USD 2,850 per person"
                  />
                </label>
              )}
              {emailHtml && (
                <iframe title="Email preview" className="ll-preview-frame" srcDoc={emailHtml} />
              )}
              <div className="ll-row">
                <button className="ll-btn secondary" disabled={!!busy} onClick={previewEmail}>
                  Preview
                </button>
                <button className="ll-btn" disabled={!!busy || missingVehicleSelection} onClick={sendEmail}>
                  {busy ? 'Sending…' : 'Send'}
                </button>
                <button className="ll-btn secondary" onClick={() => setEmailOpen(false)}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {templateOpen && (
        <div className="ll-modal-back" onClick={() => !busy && setTemplateOpen(false)}>
          <div className="ll-modal wide" onClick={(e) => e.stopPropagation()}>
            <h2>Follow-up email</h2>
            <p className="ll-muted">
              {templateId === 'custom_email'
                ? 'Write your own subject and message. Follow-up emails do not include an itinerary link.'
                : 'Edit the subject and message, then send. Follow-up emails do not include an itinerary link.'}
            </p>
            <div className="ll-form">
              <label>
                Template
                <select
                  value={templateId}
                  onChange={(e) => {
                    const next = e.target.value as TemplateId
                    const draft = templateDraft(next, row.client_name || 'Valued Client')
                    setTemplateId(next)
                    setTemplateSubject(draft.subject)
                    setTemplateBody(draft.body)
                  }}
                >
                  {FOLLOW_UP_TEMPLATES.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>To<input readOnly value={row.email || ''} /></label>
              <label>
                Subject
                <input value={templateSubject} onChange={(e) => setTemplateSubject(e.target.value)} />
              </label>
              <label>
                Message
                <textarea rows={12} value={templateBody} onChange={(e) => setTemplateBody(e.target.value)} />
              </label>
              {templatePreviewHtml ? (
                <iframe title="Follow-up email preview" className="ll-preview-frame" srcDoc={templatePreviewHtml} />
              ) : null}
              <div className="ll-row">
                <button className="ll-btn" disabled={!!busy} onClick={sendTemplateEmail}>
                  {busy ? 'Sending…' : 'Send'}
                </button>
                <button className="ll-btn secondary" disabled={!!busy} onClick={() => setTemplateOpen(false)}>
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
            <h2>WhatsApp</h2>
            <p className="ll-muted">Choose what the client should see, then prepare the message.</p>
            <div className="ll-form">
              <label className="ll-check">
                <input
                  type="checkbox"
                  checked={includeVehicle}
                  onChange={(e) => setIncludeVehicle(e.target.checked)}
                />
                Include vehicle
              </label>
              {includeVehicle ? (
                <label>
                  Vehicle shown to the client
                  <select value={sendVehicleId} onChange={(e) => setSendVehicleId(e.target.value)}>
                    <option value="">Select vehicle</option>
                    {vehicles.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              {missingVehicleSelection ? <p className="ll-muted">Please select a vehicle to include.</p> : null}
              <label className="ll-check">
                <input type="checkbox" checked={includePrice} onChange={(e) => setIncludePrice(e.target.checked)} />
                Include price
              </label>
              {includePrice && (
                <label>
                  Price shown to the client
                  <input
                    value={sendPrice}
                    onChange={(e) => setSendPrice(e.target.value)}
                    placeholder="USD 2,850 per person"
                  />
                </label>
              )}
              {waMessage ? (
                <label>
                  Message
                  <textarea rows={14} value={waMessage} onChange={(e) => setWaMessage(e.target.value)} />
                </label>
              ) : null}
              <div className="ll-row">
                <button className="ll-btn secondary" disabled={!!busy} onClick={previewClientJourney}>
                  Preview journey
                </button>
                <button className="ll-btn" disabled={!!busy || missingVehicleSelection} onClick={prepareWhatsApp}>
                  {busy ? 'Preparing…' : waMessage ? 'Refresh message' : 'Prepare message'}
                </button>
                {waHref ? (
                  <a className="ll-btn wa" href={`https://wa.me/${waHref.split('wa.me/')[1]?.split('?')[0] || ''}?text=${encodeURIComponent(waMessage)}`} target="_blank" rel="noreferrer">
                    Open WhatsApp
                  </a>
                ) : null}
                <button className="ll-btn secondary" onClick={() => setWaOpen(false)}>
                  Close
                </button>
              </div>
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
            <JourneyView journey={preview} showDistance={false} />
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
  const [openDay, setOpenDay] = useState<number | null>(0)
  const liveKilometers = totalKilometersFor(draft.days)

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
      <div className="ll-editor-bar">
        <div className="ll-row">
          {([1, 2, 3] as const).map((n) => (
            <button key={n} className={`ll-btn ${option === n ? '' : 'secondary'}`} onClick={() => setOption(n)}>
              Option {n}
            </button>
          ))}
        </div>
        <div className="ll-row">
          <button className="ll-btn secondary" onClick={onPreview}>
            Preview
          </button>
          <button className="ll-btn" disabled={busy} onClick={onSave}>
            {busy ? 'Saving…' : 'Save itinerary'}
          </button>
        </div>
      </div>

      <div className="ll-form" style={{ maxWidth: 'none' }}>
        <label>
          Journey title
          <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
        </label>
        <label>
          Introduction
          <textarea rows={3} value={draft.summary} onChange={(e) => setDraft({ ...draft, summary: e.target.value })} />
        </label>
        <div className="ll-fields-2">
          <label>
            Quote price
            <input
              value={draft.price || ''}
              onChange={(e) => setDraft({ ...draft, price: e.target.value })}
              placeholder="USD 2,850 per person"
            />
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
        </div>
        <label>
          Total kilometers
          <input readOnly value={formatKilometers(liveKilometers) || 'Add locations to calculate'} />
        </label>
        <p className="ll-muted" style={{ marginTop: '-0.4rem' }}>
          Colombo start and finish, road distances on transfer days, 90 km on local days.
        </p>
      </div>

      {draft.days.map((day, i) => {
        const expanded = openDay === i
        return (
          <article key={i} className="ll-day">
            <header className="ll-day-head">
              <button type="button" className="ll-more" onClick={() => setOpenDay(expanded ? null : i)} style={{ textAlign: 'left' }}>
                <p className="ll-day-num">Day {String(day.day).padStart(2, '0')}</p>
                <strong style={{ display: 'block', color: 'var(--forest)', marginTop: 4 }}>{day.title || 'Untitled day'}</strong>
                <span className="ll-muted">{day.location || 'Add a location'}</span>
              </button>
              <div className="ll-row">
                <button className="ll-btn ghost" onClick={() => moveDay(i, -1)}>
                  Up
                </button>
                <button className="ll-btn ghost" onClick={() => moveDay(i, 1)}>
                  Down
                </button>
                <button
                  className="ll-btn ghost"
                  onClick={() => {
                    setDraft({ ...draft, days: draft.days.filter((_, idx) => idx !== i).map((d, idx) => ({ ...d, day: idx + 1 })) })
                    setOpenDay(null)
                  }}
                >
                  Remove
                </button>
              </div>
            </header>
            {expanded && (
              <div className="ll-day-body ll-form" style={{ maxWidth: 'none' }}>
                <PhotoPicker
                  value={day.recommended_images[0] || ''}
                  images={library}
                  onChange={(src) => patchDay(i, { recommended_images: src ? [src] : [] })}
                />
                <label>
                  Title
                  <input value={day.title} onChange={(e) => patchDay(i, { title: e.target.value })} />
                </label>
                <div className="ll-fields-2">
                  <label>
                    Location
                    <input value={day.location} onChange={(e) => patchDay(i, { location: e.target.value })} />
                  </label>
                  <label>
                    Overnight
                    <input value={day.overnight_location} onChange={(e) => patchDay(i, { overnight_location: e.target.value })} />
                  </label>
                </div>
                <label>
                  What happens this day
                  <textarea rows={4} value={day.description} onChange={(e) => patchDay(i, { description: e.target.value })} />
                </label>
                <label>
                  Highlights
                  <textarea
                    rows={3}
                    value={day.activities.join('\n')}
                    onChange={(e) => patchDay(i, { activities: e.target.value.split('\n').filter((x) => x.trim()) })}
                    placeholder="One highlight per line"
                  />
                </label>
              </div>
            )}
          </article>
        )
      })}
      <button
        className="ll-btn secondary"
        style={{ marginTop: 16 }}
        onClick={() => {
          const next = emptyDay(draft.days.length + 1)
          setDraft({ ...draft, days: [...draft.days, next] })
          setOpenDay(draft.days.length)
        }}
      >
        Add a day
      </button>
    </div>
  )
}
