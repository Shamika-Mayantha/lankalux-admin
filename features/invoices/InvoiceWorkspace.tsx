'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { authedFetch } from '@/lib/authed-fetch'
import { consoleFetch } from '@/lib/console-api'
import { InvoicePreview, type InvoicePreviewModel } from '@/components/invoices/InvoicePreview'
import '@/components/invoices/invoice.css'

type PaymentMethod = 'bank_transfer' | 'card' | 'cash' | 'online_payment' | 'other'

type InvoiceApiRow = {
  invoice: {
    id: string
    request_id: string
    invoice_number: string
    status: string
    payment_status: string
    invoice_date: string
    due_date: string | null
    currency: string
    package_total: number
    package_description: string
    client_note: string | null
    secure_journey_url: string | null
    payment_instructions: Record<string, unknown>
  }
  payments: Array<{
    id: string
    amount: number
    currency: string
    payment_date: string
    payment_method: PaymentMethod
    reference_number: string | null
    note: string | null
    status: 'successful' | 'void'
    created_by: string | null
    created_at: string
  }>
  totals: { total: number; paid: number; balance: number }
  payment_status: string
  preview: InvoicePreviewModel
}

const METHODS: Array<{ value: PaymentMethod; label: string }> = [
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'card', label: 'Card' },
  { value: 'cash', label: 'Cash' },
  { value: 'online_payment', label: 'Online Payment' },
  { value: 'other', label: 'Other' },
]

const emptyPayment = () => ({
  amount: '',
  currency: 'USD',
  payment_date: new Date().toISOString().slice(0, 10),
  payment_method: 'bank_transfer' as PaymentMethod,
  reference_number: '',
  note: '',
})

function statusClass(status: string) {
  if (status === 'paid') return 'sold'
  if (status === 'overdue' || status === 'cancelled') return 'cancelled'
  if (status === 'partially_paid' || status === 'sent') return 'follow_up'
  return ''
}

function statusLabel(status: string) {
  return status.replace(/_/g, ' ')
}

type InvoiceSource = {
  ready: boolean
  reason: string | null
  client: {
    name: string
    email: string | null
    phone: string | null
    country: string | null
    adults: number
    children: number
    childrenAges: number[]
    arrival_date: string | null
    departure_date: string | null
  }
  journey: {
    title?: string
    days?: number
    nights?: number
    destinations?: string[]
    summary?: string
    secure_journey_link?: string | null
  } | null
  vehicle: { name?: string; category?: string; description?: string } | null
  chauffeurGuide: { name: string | null; role: string }
  currency: string
  packageTotal: number
  packageDescription: string
}

function createdInvoiceId(data: { invoice?: { id?: string; invoice?: { id?: string } } }) {
  return data.invoice?.invoice?.id || data.invoice?.id
}

function TripSourceFields({ source }: { source: InvoiceSource }) {
  const journey = source.journey
  const vehicle = source.vehicle
  return (
    <div className="ll-card" style={{ marginBottom: 18 }}>
      <h3>From this request</h3>
      <p className="ll-muted">These fields are pulled from the selected itinerary, vehicle and chauffeur-guide. They are not typed in by hand.</p>
      <div className="ll-grid-2" style={{ marginTop: 14 }}>
        <div>
          <p className="ll-muted" style={{ margin: 0 }}>Client</p>
          <p className="ll-card-title">{source.client.name}</p>
          <p className="ll-muted">
            {[source.client.email, source.client.phone, source.client.country].filter(Boolean).join(' · ') || '—'}
          </p>
          <p className="ll-muted">
            {source.client.adults} adults{source.client.children ? ` · ${source.client.children} children` : ''}
          </p>
        </div>
        <div>
          <p className="ll-muted" style={{ margin: 0 }}>Travel dates</p>
          <p className="ll-card-title">
            {source.client.arrival_date || '—'} → {source.client.departure_date || '—'}
          </p>
        </div>
        <div>
          <p className="ll-muted" style={{ margin: 0 }}>Selected itinerary</p>
          <p className="ll-card-title">{journey?.title || 'Not selected yet'}</p>
          {journey?.destinations?.length ? <p className="ll-muted">{journey.destinations.join(' · ')}</p> : null}
          {journey?.days ? (
            <p className="ll-muted">
              {journey.days} days / {journey.nights} nights
            </p>
          ) : null}
        </div>
        <div>
          <p className="ll-muted" style={{ margin: 0 }}>Vehicle</p>
          <p className="ll-card-title">{vehicle?.name || 'Not selected yet'}</p>
          {vehicle?.description ? <p className="ll-muted">{vehicle.description}</p> : null}
        </div>
        <div>
          <p className="ll-muted" style={{ margin: 0 }}>Chauffeur-Guide</p>
          <p className="ll-card-title">{source.chauffeurGuide.name || 'Not assigned yet'}</p>
          <p className="ll-muted">{source.chauffeurGuide.role}</p>
        </div>
        <div>
          <p className="ll-muted" style={{ margin: 0 }}>Suggested package</p>
          <p className="ll-card-title">
            {source.currency} {Number(source.packageTotal || 0).toFixed(2)}
          </p>
          <p className="ll-muted">{source.packageDescription}</p>
        </div>
      </div>
      {source.reason ? <div className="ll-error" style={{ marginTop: 14 }}>{source.reason}</div> : null}
    </div>
  )
}

export function InvoiceWorkspace({
  requestId,
  invoiceId,
  requestEmail,
  compact,
}: {
  requestId?: string
  invoiceId?: string
  requestEmail?: string | null
  compact?: boolean
}) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [rows, setRows] = useState<InvoiceApiRow[]>([])
  const [source, setSource] = useState<InvoiceSource | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(invoiceId || null)
  const [emailTo, setEmailTo] = useState(requestEmail || '')
  const [previewOpen, setPreviewOpen] = useState(false)
  const [paymentDraft, setPaymentDraft] = useState(emptyPayment)
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null)

  const selected = useMemo(() => rows.find((r) => r.invoice.id === selectedId) || null, [rows, selectedId])
  const isDraft = selected?.invoice.status === 'draft'

  async function load(preferredId?: string) {
    setLoading(true)
    setError(null)
    try {
      const path = requestId
        ? `/api/invoices?request_id=${encodeURIComponent(requestId)}`
        : '/api/invoices'
      const data = await consoleFetch(path)
      const invoices = (data.invoices || []) as InvoiceApiRow[]
      setRows(invoices)
      if (data.source) setSource(data.source as InvoiceSource)
      const nextId = preferredId || invoiceId || selectedId || invoices[0]?.invoice.id || null
      setSelectedId(invoices.some((x) => x.invoice.id === nextId) ? nextId : invoices[0]?.invoice.id || null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load invoices.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load(invoiceId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestId, invoiceId])

  async function createInvoice() {
    if (!requestId) return
    try {
      setSaving(true)
      setNotice(null)
      const data = await consoleFetch('/api/invoices', {
        method: 'POST',
        body: JSON.stringify({ request_id: requestId }),
      })
      await load(createdInvoiceId(data))
      setNotice(`Created ${data.preview?.invoiceNumber || 'invoice'}.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create invoice.')
    } finally {
      setSaving(false)
    }
  }

  async function invoiceAction(action: 'refresh' | 'finalize' | 'duplicate') {
    if (!selected) return
    try {
      setSaving(true)
      const data = await consoleFetch(`/api/invoices/${selected.invoice.id}`, {
        method: 'POST',
        body: JSON.stringify({ action }),
      })
      await load(createdInvoiceId(data))
      setNotice(
        action === 'finalize'
          ? 'Invoice finalized. Future itinerary edits will not change this document.'
          : action === 'duplicate'
            ? 'Revised draft created from this invoice.'
            : 'Draft refreshed from the selected itinerary, vehicle and chauffeur-guide.'
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed.')
    } finally {
      setSaving(false)
    }
  }

  async function saveDraft() {
    if (!selected || !isDraft) return
    try {
      setSaving(true)
      await consoleFetch(`/api/invoices/${selected.invoice.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          invoice_date: selected.invoice.invoice_date,
          due_date: selected.invoice.due_date,
          currency: selected.invoice.currency,
          package_total: selected.invoice.package_total,
          package_description: selected.invoice.package_description,
          client_note: selected.invoice.client_note,
          secure_journey_url: selected.invoice.secure_journey_url,
        }),
      })
      await load(selected.invoice.id)
      setNotice('Draft saved.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save invoice.')
    } finally {
      setSaving(false)
    }
  }

  async function downloadPdf() {
    if (!selected) return
    try {
      const res = await authedFetch(`/api/invoices/${selected.invoice.id}/pdf`)
      if (!res.ok) throw new Error((await res.text()) || 'Failed to download PDF.')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${selected.invoice.invoice_number}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to download PDF.')
    }
  }

  async function sendEmail() {
    if (!selected) return
    try {
      setSaving(true)
      const data = await consoleFetch(`/api/invoices/${selected.invoice.id}/send-email`, {
        method: 'POST',
        body: JSON.stringify({ to: emailTo.trim() || undefined }),
      })
      await load(selected.invoice.id)
      setNotice(`Email sent to ${data.to}.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send invoice email.')
    } finally {
      setSaving(false)
    }
  }

  async function shareWhatsApp() {
    if (!selected) return
    try {
      setSaving(true)
      const data = await consoleFetch(`/api/invoices/${selected.invoice.id}/share-whatsapp`, {
        method: 'POST',
        body: JSON.stringify({}),
      })
      window.open(data.href, '_blank', 'noopener,noreferrer')
      await load(selected.invoice.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to prepare WhatsApp share.')
    } finally {
      setSaving(false)
    }
  }

  async function savePayment() {
    if (!selected) return
    const amount = Number(paymentDraft.amount)
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Enter a valid payment amount.')
      return
    }
    try {
      setSaving(true)
      if (editingPaymentId) {
        await consoleFetch(`/api/invoices/${selected.invoice.id}/payments`, {
          method: 'PATCH',
          body: JSON.stringify({ payment_id: editingPaymentId, ...paymentDraft, amount }),
        })
      } else {
        await consoleFetch(`/api/invoices/${selected.invoice.id}/payments`, {
          method: 'POST',
          body: JSON.stringify({ ...paymentDraft, amount }),
        })
      }
      setPaymentDraft({ ...emptyPayment(), currency: selected.invoice.currency })
      setEditingPaymentId(null)
      await load(selected.invoice.id)
      setNotice(editingPaymentId ? 'Payment updated.' : 'Payment recorded.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save payment.')
    } finally {
      setSaving(false)
    }
  }

  async function deletePayment(paymentId: string) {
    if (!selected) return
    if (!confirm('Remove this payment? This is logged against the request.')) return
    try {
      setSaving(true)
      await consoleFetch(`/api/invoices/${selected.invoice.id}/payments`, {
        method: 'DELETE',
        body: JSON.stringify({ payment_id: paymentId }),
      })
      await load(selected.invoice.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete payment.')
    } finally {
      setSaving(false)
    }
  }

  function updateSelected(mutator: (row: InvoiceApiRow) => InvoiceApiRow) {
    if (!selected) return
    setRows((prev) => prev.map((row) => (row.invoice.id === selected.invoice.id ? mutator(row) : row)))
  }

  return (
    <div>
      <div className="ll-row" style={{ justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          {!compact && <h2 className="ll-h1" style={{ fontSize: 28 }}>Invoices & Payments</h2>}
          <p className="ll-muted" style={{ margin: compact ? 0 : '0 0 8px' }}>
            Linked to the selected itinerary, vehicle and chauffeur-guide. Balance is calculated automatically.
          </p>
        </div>
        {requestId ? (
          <button className="ll-btn" disabled={saving || (source ? !source.ready : false)} onClick={() => void createInvoice()}>
            Create invoice
          </button>
        ) : null}
      </div>

      {error ? <div className="ll-error">{error}</div> : null}
      {notice ? <div className="ll-ok">{notice}</div> : null}

      {requestId && source ? <TripSourceFields source={source} /> : null}

      {loading ? (
        <p className="ll-muted">Loading invoices…</p>
      ) : rows.length === 0 ? (
        <div className="ll-card">
          <p className="ll-muted">
            {requestId
              ? source?.ready
                ? 'Review the fields above, then click Create invoice. Package total and payments can be confirmed on the draft.'
                : 'Select an itinerary on this request first. The invoice will then fill from that journey, vehicle and chauffeur-guide.'
              : 'No invoices yet. Open a client request and use Create invoice.'}
          </p>
        </div>
      ) : (
        <div className="ll-invoice-workspace">
          <div style={{ overflow: 'auto' }}>
            <table className="ll-table">
              <thead>
                <tr>
                  <th>Invoice</th>
                  {!requestId ? <th>Request</th> : null}
                  <th>Status</th>
                  <th>Total</th>
                  <th>Paid</th>
                  <th>Balance</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.invoice.id}
                    onClick={() => setSelectedId(row.invoice.id)}
                    style={{ cursor: 'pointer', background: selectedId === row.invoice.id ? 'rgba(177,133,68,0.12)' : undefined }}
                  >
                    <td>
                      <Link href={`/console/invoices/${row.invoice.id}`} onClick={(e) => e.stopPropagation()}>
                        {row.invoice.invoice_number}
                      </Link>
                    </td>
                    {!requestId ? (
                      <td>
                        <Link href={`/console/requests/${row.invoice.request_id}`}>{row.preview.client.name}</Link>
                      </td>
                    ) : null}
                    <td>
                      <span className={`ll-pill ${statusClass(row.invoice.status)}`}>{statusLabel(row.invoice.status)}</span>
                    </td>
                    <td>{row.preview.formatted.packageTotal}</td>
                    <td>{row.preview.formatted.totalPaid}</td>
                    <td>{row.preview.formatted.balanceDue}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {selected ? (
            <div className="ll-grid-2" style={{ marginTop: 18, alignItems: 'start' }}>
              <div className="ll-form" style={{ maxWidth: 'none' }}>
                <div className="ll-fields-2">
                  <label>
                    Invoice date
                    <input
                      type="date"
                      value={selected.invoice.invoice_date}
                      disabled={!isDraft}
                      onChange={(e) => updateSelected((row) => ({ ...row, invoice: { ...row.invoice, invoice_date: e.target.value } }))}
                    />
                  </label>
                  <label>
                    Payment due date
                    <input
                      type="date"
                      value={selected.invoice.due_date || ''}
                      disabled={!isDraft}
                      onChange={(e) => updateSelected((row) => ({ ...row, invoice: { ...row.invoice, due_date: e.target.value || null } }))}
                    />
                  </label>
                  <label>
                    Currency
                    <input
                      value={selected.invoice.currency}
                      disabled={!isDraft}
                      onChange={(e) => updateSelected((row) => ({ ...row, invoice: { ...row.invoice, currency: e.target.value.toUpperCase() } }))}
                    />
                  </label>
                  <label>
                    Package total
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={selected.invoice.package_total}
                      disabled={!isDraft}
                      onChange={(e) =>
                        updateSelected((row) => ({
                          ...row,
                          invoice: { ...row.invoice, package_total: Number(e.target.value || 0) },
                        }))
                      }
                    />
                  </label>
                </div>
                <label>
                  Package description
                  <input
                    value={selected.invoice.package_description}
                    disabled={!isDraft}
                    onChange={(e) => updateSelected((row) => ({ ...row, invoice: { ...row.invoice, package_description: e.target.value } }))}
                  />
                </label>
                <label>
                  Client note
                  <textarea
                    value={selected.invoice.client_note || ''}
                    disabled={!isDraft}
                    onChange={(e) => updateSelected((row) => ({ ...row, invoice: { ...row.invoice, client_note: e.target.value } }))}
                  />
                </label>
                <p className="ll-muted">
                  Journey: {selected.preview.journey.title} · Vehicle: {selected.preview.vehicle.name || '—'} ·
                  Chauffeur-Guide: {selected.preview.chauffeurGuide.name || '—'}
                </p>
                <div className="ll-invoice-actions">
                  {isDraft ? (
                    <>
                      <button className="ll-btn" disabled={saving} onClick={() => void saveDraft()}>
                        Save draft
                      </button>
                      <button className="ll-btn secondary" disabled={saving} onClick={() => void invoiceAction('refresh')}>
                        Refresh from request
                      </button>
                      <button className="ll-btn" disabled={saving} onClick={() => void invoiceAction('finalize')}>
                        Finalize invoice
                      </button>
                    </>
                  ) : (
                    <button className="ll-btn secondary" disabled={saving} onClick={() => void invoiceAction('duplicate')}>
                      Create revised invoice
                    </button>
                  )}
                  <button className="ll-btn secondary" onClick={() => setPreviewOpen(true)}>
                    Preview invoice
                  </button>
                  <button className="ll-btn secondary" disabled={saving} onClick={() => void downloadPdf()}>
                    Download PDF
                  </button>
                </div>

                <div className="ll-card">
                  <h3>Send to client</h3>
                  <p className="ll-muted">Uses the same LankaLux email as itineraries, with the finalized invoice PDF attached.</p>
                  <label>
                    Email
                    <input value={emailTo} onChange={(e) => setEmailTo(e.target.value)} placeholder="client@email.com" />
                  </label>
                  <div className="ll-invoice-actions" style={{ marginTop: 12 }}>
                    <button className="ll-btn" disabled={saving || isDraft} onClick={() => void sendEmail()}>
                      Send by email
                    </button>
                    <button className="ll-btn wa" disabled={saving || isDraft} onClick={() => void shareWhatsApp()}>
                      Share via WhatsApp
                    </button>
                  </div>
                </div>

                <div>
                  <h3>Payments</h3>
                  <table className="ll-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Method</th>
                        <th>Reference</th>
                        <th>Amount</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {selected.payments.filter((p) => p.status === 'successful').length === 0 ? (
                        <tr>
                          <td colSpan={5} className="ll-muted">
                            No payments recorded.
                          </td>
                        </tr>
                      ) : (
                        selected.payments
                          .filter((p) => p.status === 'successful')
                          .map((payment) => (
                            <tr key={payment.id}>
                              <td>{payment.payment_date}</td>
                              <td>{METHODS.find((m) => m.value === payment.payment_method)?.label || payment.payment_method}</td>
                              <td>{payment.reference_number || '—'}</td>
                              <td>
                                {payment.currency} {payment.amount.toFixed(2)}
                              </td>
                              <td>
                                <button
                                  className="ll-btn ghost"
                                  onClick={() => {
                                    setEditingPaymentId(payment.id)
                                    setPaymentDraft({
                                      amount: String(payment.amount),
                                      currency: payment.currency,
                                      payment_date: payment.payment_date,
                                      payment_method: payment.payment_method,
                                      reference_number: payment.reference_number || '',
                                      note: payment.note || '',
                                    })
                                  }}
                                >
                                  Edit
                                </button>
                                <button className="ll-btn ghost" onClick={() => void deletePayment(payment.id)}>
                                  Remove
                                </button>
                              </td>
                            </tr>
                          ))
                      )}
                    </tbody>
                  </table>
                  <p className="ll-muted" style={{ marginTop: 10 }}>
                    Total: {selected.preview.formatted.packageTotal} · Paid: {selected.preview.formatted.totalPaid} ·
                    Balance: {selected.preview.formatted.balanceDue}
                  </p>
                  <div className="ll-fields-2" style={{ marginTop: 12 }}>
                    <label>
                      Date
                      <input
                        type="date"
                        value={paymentDraft.payment_date}
                        onChange={(e) => setPaymentDraft((p) => ({ ...p, payment_date: e.target.value }))}
                      />
                    </label>
                    <label>
                      Method
                      <select
                        value={paymentDraft.payment_method}
                        onChange={(e) => setPaymentDraft((p) => ({ ...p, payment_method: e.target.value as PaymentMethod }))}
                      >
                        {METHODS.map((m) => (
                          <option key={m.value} value={m.value}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Amount
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={paymentDraft.amount}
                        onChange={(e) => setPaymentDraft((p) => ({ ...p, amount: e.target.value }))}
                      />
                    </label>
                    <label>
                      Currency
                      <input
                        value={paymentDraft.currency}
                        onChange={(e) => setPaymentDraft((p) => ({ ...p, currency: e.target.value.toUpperCase() }))}
                      />
                    </label>
                    <label>
                      Reference
                      <input
                        value={paymentDraft.reference_number}
                        onChange={(e) => setPaymentDraft((p) => ({ ...p, reference_number: e.target.value }))}
                      />
                    </label>
                    <label>
                      Note
                      <input value={paymentDraft.note} onChange={(e) => setPaymentDraft((p) => ({ ...p, note: e.target.value }))} />
                    </label>
                  </div>
                  <div className="ll-invoice-actions" style={{ marginTop: 12 }}>
                    <button className="ll-btn" disabled={saving} onClick={() => void savePayment()}>
                      {editingPaymentId ? 'Save payment' : 'Add payment'}
                    </button>
                    {editingPaymentId ? (
                      <button
                        className="ll-btn secondary"
                        onClick={() => {
                          setEditingPaymentId(null)
                          setPaymentDraft(emptyPayment())
                        }}
                      >
                        Cancel edit
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
              <div className="ll-invoice-stage">
                <InvoicePreview model={selected.preview} />
              </div>
            </div>
          ) : null}
        </div>
      )}

      {previewOpen && selected ? (
        <div className="ll-modal-back" onClick={() => setPreviewOpen(false)}>
          <div className="ll-modal wide" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 860, maxHeight: '90vh', overflow: 'auto' }}>
            <div className="ll-row" style={{ justifyContent: 'space-between' }}>
              <h3>Preview invoice</h3>
              <button className="ll-btn ghost" onClick={() => setPreviewOpen(false)}>
                Close
              </button>
            </div>
            <InvoicePreview model={selected.preview} />
          </div>
        </div>
      ) : null}
    </div>
  )
}
