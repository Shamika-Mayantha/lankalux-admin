'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { authedFetch, authedJson } from '@/lib/authed-fetch'
import { InvoicePreview, type InvoicePreviewModel } from '@/components/invoices/InvoicePreview'
import { ThemeToggle } from '@/components/ThemeToggle'

type InvoiceBundle = {
  invoice: {
    id: string
    request_id: string
    invoice_number: string
    status: string
    payment_status: string
    currency: string
    package_total: number
    due_date: string | null
    invoice_date: string
  }
  totals: { total: number; paid: number; balance: number }
}

type InvoiceResponse = {
  invoices: Array<InvoiceBundle & { preview: InvoicePreviewModel }>
}

export default function InvoicesPage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<Array<InvoiceBundle & { preview: InvoicePreviewModel }>>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)

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
      const data = await authedJson<InvoiceResponse>('/api/invoices')
      setRows(data.invoices || [])
      if (!selectedId && data.invoices?.length) setSelectedId(data.invoices[0].invoice.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load invoices.')
    } finally {
      setLoading(false)
    }
  }, [selectedId])

  useEffect(() => {
    if (!ready) return
    void load()
  }, [ready, load])

  const selected = useMemo(() => rows.find((r) => r.invoice.id === selectedId) || null, [rows, selectedId])

  async function downloadPdf(invoiceId: string) {
    try {
      const response = await authedFetch(`/api/invoices/${invoiceId}/pdf`)
      if (!response.ok) {
        const message = await response.text()
        throw new Error(message || 'Failed to download PDF.')
      }
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${rows.find((x) => x.invoice.id === invoiceId)?.invoice.invoice_number || 'invoice'}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to download PDF.')
    }
  }

  async function sendEmail(invoiceId: string) {
    try {
      await authedJson(`/api/invoices/${invoiceId}/send-email`, { method: 'POST', body: JSON.stringify({}) })
      alert('Invoice email sent.')
      await load()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to send invoice email.')
    }
  }

  async function shareWhatsApp(invoiceId: string) {
    try {
      const data = await authedJson<{ href: string }>(`/api/invoices/${invoiceId}/share-whatsapp`, {
        method: 'POST',
        body: JSON.stringify({}),
      })
      window.open(data.href, '_blank', 'noopener,noreferrer')
      await load()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to prepare WhatsApp share.')
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
            <h1 className="text-2xl font-semibold text-primary">Invoices</h1>
            <p className="text-sm text-secondary mt-1">Auto-linked to requests, selected itineraries, vehicles, and chauffeur-guides.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <ThemeToggle />
            <button type="button" onClick={() => void load()} className="btn-secondary-theme">Refresh</button>
            <Link href="/dashboard" className="btn-secondary-theme no-underline">Back to dashboard</Link>
          </div>
        </div>

        {error && <div className="rounded-xl border border-red-500/50 bg-red-900/20 px-4 py-3 text-red-200">{error}</div>}

        <div className="grid grid-cols-1 xl:grid-cols-[1.25fr_1fr] gap-6">
          <div className="rounded-2xl border border-theme bg-card p-4 shadow-card overflow-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead>
                <tr className="text-left text-secondary border-b border-theme">
                  <th className="py-3 pr-3">Invoice</th>
                  <th className="py-3 pr-3">Request</th>
                  <th className="py-3 pr-3">Status</th>
                  <th className="py-3 pr-3">Total</th>
                  <th className="py-3 pr-3">Paid</th>
                  <th className="py-3 pr-3">Balance</th>
                  <th className="py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-secondary">Loading invoices…</td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-secondary">No invoices yet.</td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr
                      key={row.invoice.id}
                      className={`border-b border-theme/60 ${selectedId === row.invoice.id ? 'bg-[color:var(--bg-btn-secondary)]' : ''}`}
                    >
                      <td className="py-3 pr-3">
                        <button type="button" onClick={() => setSelectedId(row.invoice.id)} className="text-left hover:text-accent-theme">
                          {row.invoice.invoice_number}
                        </button>
                      </td>
                      <td className="py-3 pr-3">
                        <Link href={`/requests/${row.invoice.request_id}`} className="text-accent-theme hover:underline">
                          {row.invoice.request_id}
                        </Link>
                      </td>
                      <td className="py-3 pr-3">
                        <span className="inline-flex px-2 py-1 rounded-md text-xs bg-inner-theme border border-theme uppercase">{row.invoice.status}</span>
                      </td>
                      <td className="py-3 pr-3">{row.preview.formatted.packageTotal}</td>
                      <td className="py-3 pr-3">{row.preview.formatted.totalPaid}</td>
                      <td className="py-3 pr-3">{row.preview.formatted.balanceDue}</td>
                      <td className="py-3">
                        <div className="flex flex-wrap gap-2">
                          <button type="button" className="btn-secondary-theme !px-3 !py-2 !min-h-0 text-xs" onClick={() => void downloadPdf(row.invoice.id)}>PDF</button>
                          <button type="button" className="btn-secondary-theme !px-3 !py-2 !min-h-0 text-xs" onClick={() => void sendEmail(row.invoice.id)}>Email</button>
                          <button type="button" className="btn-secondary-theme !px-3 !py-2 !min-h-0 text-xs" onClick={() => void shareWhatsApp(row.invoice.id)}>WhatsApp</button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="space-y-4">
            {selected ? (
              <InvoicePreview model={selected.preview} />
            ) : (
              <div className="rounded-2xl border border-theme bg-card p-8 text-secondary">Select an invoice to preview.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
