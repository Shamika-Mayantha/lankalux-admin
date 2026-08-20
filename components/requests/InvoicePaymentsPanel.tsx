'use client'

import { useEffect, useMemo, useState } from 'react'
import { authedFetch, authedJson } from '@/lib/authed-fetch'
import { InvoicePreview, type InvoicePreviewModel } from '@/components/invoices/InvoicePreview'

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
    payment_method: 'bank_transfer' | 'card' | 'cash' | 'online_payment' | 'other'
    reference_number: string | null
    note: string | null
    status: 'successful' | 'void'
  }>
  totals: { total: number; paid: number; balance: number }
  payment_status: string
  preview: InvoicePreviewModel
}

const paymentMethods = [
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'card', label: 'Card' },
  { value: 'cash', label: 'Cash' },
  { value: 'online_payment', label: 'Online Payment' },
  { value: 'other', label: 'Other' },
] as const

export function InvoicePaymentsPanel({
  requestId,
  requestEmail,
  requestWhatsapp,
}: {
  requestId: string
  requestEmail: string | null
  requestWhatsapp: string | null
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<InvoiceApiRow[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [emailTo, setEmailTo] = useState(requestEmail || '')
  const [paymentDraft, setPaymentDraft] = useState({
    amount: '',
    currency: 'USD',
    payment_date: new Date().toISOString().slice(0, 10),
    payment_method: 'bank_transfer' as 'bank_transfer' | 'card' | 'cash' | 'online_payment' | 'other',
    reference_number: '',
    note: '',
  })

  const selected = useMemo(() => rows.find((r) => r.invoice.id === selectedId) || null, [rows, selectedId])
  const isDraft = selected?.invoice.status === 'draft'

  async function loadInvoices(preferredId?: string) {
    try {
      setLoading(true)
      setError(null)
      const data = await authedJson<{ invoices: InvoiceApiRow[] }>(`/api/invoices?request_id=${encodeURIComponent(requestId)}`)
      setRows(data.invoices || [])
      if (!data.invoices?.length) {
        setSelectedId(null)
        return
      }
      const nextId = preferredId || selectedId || data.invoices[0].invoice.id
      const exists = data.invoices.some((x) => x.invoice.id === nextId)
      setSelectedId(exists ? nextId : data.invoices[0].invoice.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load invoices.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadInvoices()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestId])

  async function createInvoice() {
    try {
      setSaving(true)
      const data = await authedJson<{ invoice: InvoiceApiRow }>(`/api/invoices`, {
        method: 'POST',
        body: JSON.stringify({ request_id: requestId }),
      })
      await loadInvoices(data.invoice.invoice.id)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to create invoice.')
    } finally {
      setSaving(false)
    }
  }

  async function invoiceAction(action: 'refresh' | 'finalize' | 'duplicate' | 'mark_sent', channel?: 'email' | 'whatsapp') {
    if (!selected) return
    try {
      setSaving(true)
      const data = await authedJson<{ invoice: InvoiceApiRow }>(`/api/invoices/${selected.invoice.id}`, {
        method: 'POST',
        body: JSON.stringify({ action, channel }),
      })
      await loadInvoices(data.invoice.invoice.id)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Action failed.')
    } finally {
      setSaving(false)
    }
  }

  async function saveInvoiceEdits() {
    if (!selected || !isDraft) return
    const payload = {
      invoice_date: selected.invoice.invoice_date,
      due_date: selected.invoice.due_date,
      currency: selected.invoice.currency,
      package_total: selected.invoice.package_total,
      package_description: selected.invoice.package_description,
      client_note: selected.invoice.client_note,
      secure_journey_url: selected.invoice.secure_journey_url,
      payment_instructions: selected.invoice.payment_instructions,
    }
    try {
      setSaving(true)
      await authedJson(`/api/invoices/${selected.invoice.id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      })
      await loadInvoices(selected.invoice.id)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to save invoice.')
    } finally {
      setSaving(false)
    }
  }

  async function downloadPdf() {
    if (!selected) return
    try {
      const res = await authedFetch(`/api/invoices/${selected.invoice.id}/pdf`)
      if (!res.ok) throw new Error(await res.text())
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${selected.invoice.invoice_number}.pdf`
      a.click()
      URL.revokeObjectURL(url)
      await loadInvoices(selected.invoice.id)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to download PDF.')
    }
  }

  async function sendEmail() {
    if (!selected) return
    try {
      setSaving(true)
      await authedJson(`/api/invoices/${selected.invoice.id}/send-email`, {
        method: 'POST',
        body: JSON.stringify({ to: emailTo.trim() || undefined }),
      })
      alert('Invoice email sent successfully.')
      await loadInvoices(selected.invoice.id)
      await invoiceAction('mark_sent', 'email')
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to send invoice email.')
    } finally {
      setSaving(false)
    }
  }

  async function shareWhatsApp() {
    if (!selected) return
    try {
      setSaving(true)
      const data = await authedJson<{ href: string }>(`/api/invoices/${selected.invoice.id}/share-whatsapp`, {
        method: 'POST',
        body: JSON.stringify({}),
      })
      window.open(data.href, '_blank', 'noopener,noreferrer')
      await loadInvoices(selected.invoice.id)
      await invoiceAction('mark_sent', 'whatsapp')
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to prepare WhatsApp share.')
    } finally {
      setSaving(false)
    }
  }

  async function addPayment() {
    if (!selected) return
    const amount = Number(paymentDraft.amount)
    if (!Number.isFinite(amount) || amount <= 0) {
      alert('Enter a valid payment amount.')
      return
    }
    try {
      setSaving(true)
      await authedJson(`/api/invoices/${selected.invoice.id}/payments`, {
        method: 'POST',
        body: JSON.stringify({
          ...paymentDraft,
          amount,
        }),
      })
      setPaymentDraft((prev) => ({ ...prev, amount: '', reference_number: '', note: '' }))
      await loadInvoices(selected.invoice.id)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to add payment.')
    } finally {
      setSaving(false)
    }
  }

  async function voidPayment(paymentId: string) {
    if (!selected) return
    try {
      setSaving(true)
      await authedJson(`/api/invoices/${selected.invoice.id}/payments`, {
        method: 'PATCH',
        body: JSON.stringify({ payment_id: paymentId, status: 'void' }),
      })
      await loadInvoices(selected.invoice.id)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to update payment.')
    } finally {
      setSaving(false)
    }
  }

  async function deletePayment(paymentId: string) {
    if (!selected) return
    if (!confirm('Remove this payment?')) return
    try {
      setSaving(true)
      await authedJson(`/api/invoices/${selected.invoice.id}/payments`, {
        method: 'DELETE',
        body: JSON.stringify({ payment_id: paymentId }),
      })
      await loadInvoices(selected.invoice.id)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to delete payment.')
    } finally {
      setSaving(false)
    }
  }

  function updateSelected(mutator: (draft: InvoiceApiRow) => InvoiceApiRow) {
    if (!selected) return
    setRows((prev) => prev.map((row) => (row.invoice.id === selected.invoice.id ? mutator(row) : row)))
  }

  return (
    <div className="card-theme w-full p-8 hover:-translate-y-0.5">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8 text-left">
        <div>
          <h2 className="text-left text-2xl font-semibold text-accent-theme">Invoices & Payments</h2>
          <p className="text-sm text-secondary mt-2">Create, review, finalize, and share invoices linked to this request.</p>
        </div>
        <button type="button" className="btn-primary-theme" onClick={() => void createInvoice()} disabled={saving}>
          Create invoice
        </button>
      </div>

      {error && <div className="rounded-xl border border-red-500/50 bg-red-900/20 px-4 py-3 text-red-200 mb-5">{error}</div>}

      {loading ? (
        <div className="text-secondary py-6">Loading invoices…</div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-accent px-5 py-8 text-center text-secondary">
          No invoices yet for this request.
        </div>
      ) : (
        <div className="space-y-6">
          <div className="overflow-auto rounded-xl border border-accent bg-inner-theme">
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="text-left text-secondary border-b border-accent">
                  <th className="py-3 px-3">Invoice</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3">Date</th>
                  <th className="py-3 px-3">Total</th>
                  <th className="py-3 px-3">Paid</th>
                  <th className="py-3 px-3">Balance</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.invoice.id}
                    className={`border-b border-accent/70 hover:bg-[var(--bg-btn-secondary)] cursor-pointer ${
                      selectedId === row.invoice.id ? 'bg-[var(--bg-btn-secondary)]' : ''
                    }`}
                    onClick={() => setSelectedId(row.invoice.id)}
                  >
                    <td className="py-3 px-3 font-medium">{row.invoice.invoice_number}</td>
                    <td className="py-3 px-3">
                      <span className="inline-block px-2 py-1 text-xs rounded-md border border-theme uppercase">
                        {row.invoice.status}
                      </span>
                    </td>
                    <td className="py-3 px-3">{row.invoice.invoice_date}</td>
                    <td className="py-3 px-3">{row.preview.formatted.packageTotal}</td>
                    <td className="py-3 px-3">{row.preview.formatted.totalPaid}</td>
                    <td className="py-3 px-3">{row.preview.formatted.balanceDue}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {selected && (
            <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_1fr] gap-6">
              <div className="space-y-5">
                <div className="rounded-xl border border-accent bg-inner-theme p-5 space-y-4 text-left">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className="label-theme">Invoice date</label>
                      <input
                        type="date"
                        value={selected.invoice.invoice_date}
                        onChange={(e) => updateSelected((row) => ({ ...row, invoice: { ...row.invoice, invoice_date: e.target.value } }))}
                        className="input-field-theme"
                        disabled={!isDraft}
                      />
                    </div>
                    <div>
                      <label className="label-theme">Due date</label>
                      <input
                        type="date"
                        value={selected.invoice.due_date || ''}
                        onChange={(e) => updateSelected((row) => ({ ...row, invoice: { ...row.invoice, due_date: e.target.value || null } }))}
                        className="input-field-theme"
                        disabled={!isDraft}
                      />
                    </div>
                    <div>
                      <label className="label-theme">Currency</label>
                      <input
                        type="text"
                        value={selected.invoice.currency}
                        onChange={(e) => updateSelected((row) => ({ ...row, invoice: { ...row.invoice, currency: e.target.value.toUpperCase() } }))}
                        className="input-field-theme"
                        disabled={!isDraft}
                      />
                    </div>
                    <div>
                      <label className="label-theme">Package total</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={selected.invoice.package_total}
                        onChange={(e) =>
                          updateSelected((row) => ({
                            ...row,
                            invoice: { ...row.invoice, package_total: Number(e.target.value || 0) },
                          }))
                        }
                        className="input-field-theme"
                        disabled={!isDraft}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="label-theme">Package description</label>
                    <input
                      type="text"
                      value={selected.invoice.package_description}
                      onChange={(e) => updateSelected((row) => ({ ...row, invoice: { ...row.invoice, package_description: e.target.value } }))}
                      className="input-field-theme"
                      disabled={!isDraft}
                    />
                  </div>
                  <div>
                    <label className="label-theme">Client note</label>
                    <textarea
                      value={selected.invoice.client_note || ''}
                      onChange={(e) => updateSelected((row) => ({ ...row, invoice: { ...row.invoice, client_note: e.target.value } }))}
                      className="input-field-theme min-h-[96px]"
                      disabled={!isDraft}
                    />
                  </div>
                  <div>
                    <label className="label-theme">Secure journey link</label>
                    <input
                      type="url"
                      value={selected.invoice.secure_journey_url || ''}
                      onChange={(e) => updateSelected((row) => ({ ...row, invoice: { ...row.invoice, secure_journey_url: e.target.value || null } }))}
                      className="input-field-theme"
                      disabled={!isDraft}
                    />
                  </div>

                  <div className="flex flex-wrap gap-3 pt-2">
                    {isDraft && (
                      <>
                        <button type="button" className="btn-primary-theme" onClick={() => void saveInvoiceEdits()} disabled={saving}>
                          Save draft
                        </button>
                        <button type="button" className="btn-secondary-theme" onClick={() => void invoiceAction('refresh')} disabled={saving}>
                          Refresh from request
                        </button>
                        <button type="button" className="btn-secondary-theme" onClick={() => void invoiceAction('finalize')} disabled={saving}>
                          Finalize invoice
                        </button>
                      </>
                    )}
                    <button type="button" className="btn-secondary-theme" onClick={() => void invoiceAction('duplicate')} disabled={saving}>
                      Duplicate as revised
                    </button>
                    <button type="button" className="btn-secondary-theme" onClick={() => void downloadPdf()} disabled={saving}>
                      Download PDF
                    </button>
                  </div>

                  <div className="pt-2 border-t border-accent">
                    <h4 className="text-sm font-semibold text-accent-theme mb-2">Send finalized invoice</h4>
                    <div className="grid sm:grid-cols-[1fr_auto_auto] gap-3">
                      <input
                        type="email"
                        value={emailTo}
                        onChange={(e) => setEmailTo(e.target.value)}
                        className="input-field-theme"
                        placeholder={requestEmail || 'client@email.com'}
                      />
                      <button type="button" className="btn-secondary-theme" onClick={() => void sendEmail()} disabled={saving || isDraft}>
                        Send email
                      </button>
                      <button type="button" className="btn-secondary-theme" onClick={() => void shareWhatsApp()} disabled={saving || isDraft}>
                        Share WhatsApp
                      </button>
                    </div>
                    {!requestWhatsapp && <p className="text-xs text-secondary mt-2">No client WhatsApp on this request; share can still open generic WhatsApp compose.</p>}
                  </div>
                </div>

                <div className="rounded-xl border border-accent bg-inner-theme p-5 text-left">
                  <h4 className="text-sm font-semibold text-accent-theme mb-3">Payments</h4>
                  <div className="overflow-auto">
                    <table className="w-full text-sm min-w-[620px]">
                      <thead>
                        <tr className="text-left text-secondary border-b border-accent">
                          <th className="py-2 pr-3">Date</th>
                          <th className="py-2 pr-3">Method</th>
                          <th className="py-2 pr-3">Reference</th>
                          <th className="py-2 pr-3">Amount</th>
                          <th className="py-2 pr-3">Status</th>
                          <th className="py-2">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selected.payments.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="py-4 text-secondary">No payments recorded.</td>
                          </tr>
                        ) : (
                          selected.payments.map((payment) => (
                            <tr key={payment.id} className="border-b border-accent/60">
                              <td className="py-2 pr-3">{payment.payment_date}</td>
                              <td className="py-2 pr-3 uppercase">{payment.payment_method.replace(/_/g, ' ')}</td>
                              <td className="py-2 pr-3">{payment.reference_number || '—'}</td>
                              <td className="py-2 pr-3">{payment.currency} {payment.amount.toFixed(2)}</td>
                              <td className="py-2 pr-3">{payment.status}</td>
                              <td className="py-2">
                                <div className="flex gap-2">
                                  {payment.status !== 'void' && (
                                    <button type="button" className="btn-secondary-theme !px-2 !py-1 !min-h-0 text-xs" onClick={() => void voidPayment(payment.id)}>
                                      Void
                                    </button>
                                  )}
                                  <button type="button" className="btn-secondary-theme !px-2 !py-1 !min-h-0 text-xs" onClick={() => void deletePayment(payment.id)}>
                                    Delete
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="grid sm:grid-cols-6 gap-3 mt-4">
                    <input
                      type="date"
                      className="input-field-theme sm:col-span-1"
                      value={paymentDraft.payment_date}
                      onChange={(e) => setPaymentDraft((p) => ({ ...p, payment_date: e.target.value }))}
                    />
                    <select
                      className="input-field-theme sm:col-span-1"
                      value={paymentDraft.payment_method}
                      onChange={(e) =>
                        setPaymentDraft((p) => ({
                          ...p,
                          payment_method: e.target.value as (typeof paymentMethods)[number]['value'],
                        }))
                      }
                    >
                      {paymentMethods.map((method) => (
                        <option key={method.value} value={method.value}>
                          {method.label}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className="input-field-theme sm:col-span-1"
                      placeholder="Amount"
                      value={paymentDraft.amount}
                      onChange={(e) => setPaymentDraft((p) => ({ ...p, amount: e.target.value }))}
                    />
                    <input
                      type="text"
                      className="input-field-theme sm:col-span-1"
                      placeholder="Currency"
                      value={paymentDraft.currency}
                      onChange={(e) => setPaymentDraft((p) => ({ ...p, currency: e.target.value.toUpperCase() }))}
                    />
                    <input
                      type="text"
                      className="input-field-theme sm:col-span-1"
                      placeholder="Reference"
                      value={paymentDraft.reference_number}
                      onChange={(e) => setPaymentDraft((p) => ({ ...p, reference_number: e.target.value }))}
                    />
                    <button type="button" className="btn-primary-theme sm:col-span-1" onClick={() => void addPayment()} disabled={saving}>
                      Add payment
                    </button>
                  </div>
                </div>
              </div>

              <InvoicePreview model={selected.preview} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
