'use client'

import { useEffect, useMemo, useState } from 'react'
import { DriverJourneyDocument } from '@/components/driver-pack/DriverJourneyDocument'
import { DriverLogDocument } from '@/components/driver-pack/DriverLogDocument'
import { PagingBoardDocument } from '@/components/driver-pack/PagingBoardDocument'
import { DriverPackPreview } from '@/components/driver-pack/DriverPackPreview'
import { consoleFetch } from '@/lib/console-api'
import {
  buildDriverPackData,
  formFromSources,
  formToFields,
  type DriverPackData,
  type DriverPackForm,
} from '@/lib/driver-pack/buildDriverPackData'
import { driverPackFilenames } from '@/lib/driver-pack/filenameHelpers'
import { attachHotelQrCodes, downloadBlob, loadBrandLogoDataUrl, renderPdfBlob, zipPdfs } from '@/lib/driver-pack/pdf'
import type { ClientRequestRow, DriverRecord, HotelRecord, ItineraryRecord, VehicleRecord } from '@/types/domain'
import { DatePicker } from '@/components/ui/DatePicker'
import { clampEndOnOrAfterStart } from '@/lib/dates'
import '@/components/driver-pack/driver-pack.css'

type DocKey = 'journey' | 'log' | 'paging'

function matchChauffeur(drivers: DriverRecord[], query: string) {
  const q = query.trim().toLowerCase()
  if (!q) return null
  const scored = drivers
    .map((driver) => {
      const name = driver.full_name.trim().toLowerCase()
      const email = (driver.email || '').trim().toLowerCase()
      const local = email.split('@')[0] || ''
      let score = 0
      if (email === q) score = 100
      else if (name === q) score = 90
      else if (local === q) score = 80
      else if (email.startsWith(q) || local.startsWith(q) || name.startsWith(q)) score = 70
      else if (email.includes(q) || name.includes(q)) score = 50
      return { driver, score }
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
  if (!scored.length) return null
  if (scored.length === 1 || scored[0].score >= 80) return scored[0].driver
  if (scored[0].score >= scored[1].score + 20) return scored[0].driver
  return null
}

export function DriverPackSection({
  request,
  itinerary,
  vehicle,
  driver,
  drivers,
  hotels,
  open,
  onOpen,
  onClose,
  onSaved,
}: {
  request: ClientRequestRow
  itinerary?: ItineraryRecord | null
  vehicle?: VehicleRecord | null
  driver?: DriverRecord | null
  drivers: DriverRecord[]
  hotels: HotelRecord[]
  open: boolean
  onOpen: () => void
  onClose: () => void
  onSaved: () => Promise<void> | void
}) {
  const sourceForm = useMemo(
    () => formFromSources({ request, itinerary, vehicle, driver }),
    [request, itinerary, vehicle, driver]
  )
  const [form, setForm] = useState<DriverPackForm>(sourceForm)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [logoSrc, setLogoSrc] = useState<string | null>(null)
  const [previewKey, setPreviewKey] = useState<DocKey | null>(null)
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null)

  useEffect(() => {
    setForm(sourceForm)
  }, [sourceForm])

  useEffect(() => {
    let alive = true
    loadBrandLogoDataUrl().then((src) => {
      if (alive) setLogoSrc(src)
    })
    return () => {
      alive = false
    }
  }, [])

  const data = useMemo(
    () => buildDriverPackData({ form, itinerary, hotels }),
    [form, itinerary, hotels]
  )
  const names = driverPackFilenames({
    guestNames: data.guestNames,
    startDate: data.startDate,
    endDate: data.endDate,
  })

  function set<K extends keyof DriverPackForm>(key: K, value: DriverPackForm[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function saveDetails() {
    setBusy('Saving chauffeur-guide details…')
    setError(null)
    try {
      const matched = matchChauffeur(drivers, form.chauffeurName)
      await consoleFetch(`/api/v2/requests/${request.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          assigned_employee: form.chauffeurName || null,
          assigned_driver_id: matched?.id || request.assigned_driver_id || null,
          arrival_flight: form.arrivalFlight || null,
          departure_flight: form.departureFlight || null,
          driver_pack: formToFields(form),
        }),
      })
      setNotice('Driver Pack details saved on this request.')
      await onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save Driver Pack details.')
    } finally {
      setBusy(null)
    }
  }

  async function makeBlob(key: DocKey, pack: DriverPackData) {
    if (key === 'journey') return renderPdfBlob(<DriverJourneyDocument data={pack} logoSrc={logoSrc} />)
    if (key === 'log') return renderPdfBlob(<DriverLogDocument data={pack} logoSrc={logoSrc} />)
    return renderPdfBlob(<PagingBoardDocument data={pack} logoSrc={logoSrc} />)
  }

  async function withFreshData() {
    return attachHotelQrCodes(buildDriverPackData({ form, itinerary, hotels }))
  }

  async function preview(key: DocKey) {
    if (key === 'paging' && !data.pagingReady) {
      setError('Paging board needs guest names.')
      return
    }
    if (key === 'log' && !data.logReady) {
      setError('Driver log needs guest names, travel dates, chauffeur-guide and a daily route.')
      return
    }
    setBusy('Generating preview…')
    setError(null)
    try {
      const pack = await withFreshData()
      const blob = await makeBlob(key, pack)
      setPreviewKey(key)
      setPreviewBlob(blob)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate preview.')
    } finally {
      setBusy(null)
    }
  }

  async function download(key: DocKey) {
    setBusy('Preparing download…')
    setError(null)
    try {
      const pack = await withFreshData()
      const blob = await makeBlob(key, pack)
      const filename = key === 'journey' ? names.journey : key === 'log' ? names.log : names.paging
      downloadBlob(blob, filename)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not download document.')
    } finally {
      setBusy(null)
    }
  }

  async function downloadZip() {
    setBusy('Preparing complete Driver Pack…')
    setError(null)
    try {
      const pack = await withFreshData()
      const files = await Promise.all([
        makeBlob('journey', pack).then((blob) => ({ name: names.journey, blob })),
        makeBlob('log', pack).then((blob) => ({ name: names.log, blob })),
        makeBlob('paging', pack).then((blob) => ({ name: names.paging, blob })),
      ])
      const zip = await zipPdfs(files)
      downloadBlob(zip, names.zip)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not download Driver Pack.')
    } finally {
      setBusy(null)
    }
  }

  async function regenerate() {
    const current = previewKey
    setNotice('Documents will use the current sold itinerary, hotels, vehicle and guide.')
    if (current) await preview(current)
  }

  const previewTitle =
    previewKey === 'journey' ? 'Driver Journey' : previewKey === 'log' ? 'Driver Log Sheet' : 'Airport Paging Board'

  return (
    <>
      <div className="ll-card ll-driver-card">
        <h3>Driver Pack</h3>
        <p className="ll-muted">Operational documents for the chauffeur-guide. The sold itinerary is not changed.</p>
        <div className="ll-grid-2" style={{ marginTop: 12 }}>
          <div>
            <p className="ll-muted" style={{ margin: 0 }}>Chauffeur-Guide</p>
            <p className="ll-card-title">{form.chauffeurName || 'Not assigned yet'}</p>
          </div>
          <div>
            <p className="ll-muted" style={{ margin: 0 }}>Vehicle</p>
            <p className="ll-card-title">{form.vehicleName || 'Not selected yet'}</p>
          </div>
          <div>
            <p className="ll-muted" style={{ margin: 0 }}>Status</p>
            <p>
              <span className={`ll-driver-status${data.status === 'ready' ? '' : ' warn'}`}>
                {data.status === 'ready' ? 'Ready' : 'Information Required'}
              </span>
            </p>
            {data.missing.length ? (
              <>
                <p className="ll-muted" style={{ margin: '8px 0 0' }}>Missing:</p>
                <ul className="ll-driver-missing">
                  {data.missing.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </>
            ) : null}
          </div>
        </div>
        <div className="ll-driver-docs">
          <DocActions
            title="Driver Journey"
            onPreview={() => {
              onOpen()
              void preview('journey')
            }}
            onDownload={() => void download('journey')}
          />
          <DocActions
            title="Driver Log Sheet"
            onPreview={() => {
              onOpen()
              void preview('log')
            }}
            onDownload={() => void download('log')}
          />
          <DocActions
            title="Paging Board"
            onPreview={() => {
              onOpen()
              void preview('paging')
            }}
            onDownload={() => void download('paging')}
          />
        </div>
        <div className="ll-row" style={{ marginTop: 16 }}>
          <button className="ll-btn secondary" onClick={onOpen}>
            Edit Details
          </button>
          <button className="ll-btn" onClick={() => void downloadZip()}>
            Download Complete Driver Pack
          </button>
        </div>
      </div>

      {open ? (
        <div className="ll-modal-back" onClick={onClose}>
          <div className="ll-modal wide ll-driver-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ll-row" style={{ justifyContent: 'space-between' }}>
              <div>
                <p className="ll-muted" style={{ margin: 0 }}>SOLD REQUEST</p>
                <h2 style={{ margin: '4px 0 0' }}>Driver Pack</h2>
              </div>
              <button className="ll-btn secondary" onClick={onClose}>
                Close
              </button>
            </div>
            {busy ? <p className="ll-muted">{busy}</p> : null}
            {notice ? <div className="ll-ok">{notice}</div> : null}
            {error ? <div className="ll-error">{error}</div> : null}

            <div className="ll-form" style={{ marginTop: 12 }}>
              <div className="ll-fields-2">
                <label>
                  Guest / Client Names
                  <input value={form.guestNames} onChange={(e) => set('guestNames', e.target.value)} />
                </label>
                <label>
                  Chauffeur-Guide Name
                  <input
                    list="ll-driver-pack-chauffeurs"
                    value={form.chauffeurName}
                    onChange={(e) => {
                      const typed = e.target.value
                      const match = matchChauffeur(drivers, typed)
                      setForm((current) => ({
                        ...current,
                        chauffeurName: typed,
                        chauffeurPhone: match?.phone || current.chauffeurPhone,
                      }))
                    }}
                  />
                  <datalist id="ll-driver-pack-chauffeurs">
                    {drivers.map((item) => (
                      <option key={item.id} value={item.full_name}>
                        {item.phone || item.email || item.full_name}
                      </option>
                    ))}
                  </datalist>
                </label>
                <label>
                  Chauffeur-Guide Phone
                  <input value={form.chauffeurPhone} onChange={(e) => set('chauffeurPhone', e.target.value)} />
                </label>
                <label>
                  Vehicle
                  <input value={form.vehicleName} readOnly />
                </label>
                <label>
                  Vehicle Registration Number
                  <input value={form.vehicleRegistration} onChange={(e) => set('vehicleRegistration', e.target.value)} />
                </label>
                <DatePicker
                  id="driver-start"
                  theme="brand"
                  label="Travel Start Date"
                  value={form.startDate}
                  onChange={(start) => {
                    set('startDate', start)
                    set('endDate', clampEndOnOrAfterStart(start, form.endDate))
                  }}
                  rangeStart={form.startDate}
                  rangeEnd={form.endDate}
                  placeholder="Select start"
                />
                <DatePicker
                  id="driver-end"
                  theme="brand"
                  label="Travel End Date"
                  value={form.endDate}
                  onChange={(end) => set('endDate', clampEndOnOrAfterStart(form.startDate, end))}
                  min={form.startDate || undefined}
                  rangeStart={form.startDate}
                  rangeEnd={form.endDate}
                  placeholder="Select end"
                />
                <label>
                  Arrival Flight Number
                  <input value={form.arrivalFlight} onChange={(e) => set('arrivalFlight', e.target.value)} />
                </label>
                <DatePicker
                  id="driver-arrival"
                  theme="brand"
                  label="Arrival Date"
                  value={form.arrivalDate}
                  onChange={(start) => {
                    set('arrivalDate', start)
                    set('departureDate', clampEndOnOrAfterStart(start, form.departureDate))
                  }}
                  rangeStart={form.arrivalDate}
                  rangeEnd={form.departureDate}
                  placeholder="Select arrival"
                />
                <label>
                  Arrival Time
                  <input type="time" value={form.arrivalTime} onChange={(e) => set('arrivalTime', e.target.value)} />
                </label>
                <label>
                  Departure Flight Number
                  <input value={form.departureFlight} onChange={(e) => set('departureFlight', e.target.value)} />
                </label>
                <DatePicker
                  id="driver-departure"
                  theme="brand"
                  label="Departure Date"
                  value={form.departureDate}
                  onChange={(end) => set('departureDate', clampEndOnOrAfterStart(form.arrivalDate, end))}
                  min={form.arrivalDate || undefined}
                  rangeStart={form.arrivalDate}
                  rangeEnd={form.departureDate}
                  placeholder="Select departure"
                />
                <label>
                  Departure Time
                  <input type="time" value={form.departureTime} onChange={(e) => set('departureTime', e.target.value)} />
                </label>
              </div>
              <label>
                Optional internal notes
                <textarea rows={3} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
              </label>
              <div className="ll-row" style={{ justifyContent: 'flex-end' }}>
                <button className="ll-btn" disabled={!!busy} onClick={() => void saveDetails()}>
                  Save details
                </button>
              </div>
            </div>

            <div className="ll-driver-docs">
              <DocActions title="Driver Journey" onPreview={() => void preview('journey')} onDownload={() => void download('journey')} />
              <DocActions title="Driver Log Sheet" onPreview={() => void preview('log')} onDownload={() => void download('log')} />
              <DocActions title="Paging Board" onPreview={() => void preview('paging')} onDownload={() => void download('paging')} />
            </div>
            <div className="ll-row" style={{ marginTop: 16 }}>
              <button className="ll-btn secondary" disabled={!!busy} onClick={() => void regenerate()}>
                Regenerate Driver Pack
              </button>
              <button className="ll-btn" disabled={!!busy} onClick={() => void downloadZip()}>
                Download Complete Driver Pack
              </button>
            </div>

            {previewKey ? (
              <div style={{ marginTop: 18 }}>
                <p className="ll-muted">{previewTitle} preview — same file as download</p>
                <DriverPackPreview blob={previewBlob} title={previewTitle} />
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  )
}

function DocActions({
  title,
  onPreview,
  onDownload,
}: {
  title: string
  onPreview: () => void
  onDownload: () => void
}) {
  return (
    <div className="ll-driver-doc">
      <strong>{title}</strong>
      <div className="ll-row">
        <button className="ll-btn secondary" type="button" onClick={onPreview}>
          Preview
        </button>
        <button className="ll-btn secondary" type="button" onClick={onDownload}>
          Download
        </button>
      </div>
    </div>
  )
}
