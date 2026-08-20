'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { authedJson } from '@/lib/authed-fetch'
import { ThemeToggle } from '@/components/ThemeToggle'

type PaymentRow = {
  id: string
  invoice_id: string
  invoice_number?: string
  request_id?: string
  payment_date: string
  payment_method: string
  reference_number: string | null
  amount: number
  currency: string
  note: string | null
}

export default function PaymentsPage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<PaymentRow[]>([])

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
      const data = await authedJson<{ payments: PaymentRow[] }>('/api/invoices/payments')
      setRows(data.payments || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load payments.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!ready) return
    void load()
  }, [ready, load])

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
            <h1 className="text-2xl font-semibold">Payments</h1>
            <p className="text-sm text-secondary mt-1">Payment ledger across all invoices.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <ThemeToggle />
            <button type="button" onClick={() => void load()} className="btn-secondary-theme">Refresh</button>
            <Link href="/dashboard" className="btn-secondary-theme no-underline">Back to dashboard</Link>
          </div>
        </div>

        {error && <div className="rounded-xl border border-red-500/50 bg-red-900/20 px-4 py-3 text-red-200">{error}</div>}

        <div className="rounded-2xl border border-theme bg-card p-5 shadow-card overflow-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="text-left text-secondary border-b border-theme">
                <th className="py-3 pr-3">Date</th>
                <th className="py-3 pr-3">Invoice</th>
                <th className="py-3 pr-3">Request</th>
                <th className="py-3 pr-3">Method</th>
                <th className="py-3 pr-3">Reference</th>
                <th className="py-3 pr-3 text-right">Amount</th>
                <th className="py-3 pr-3">Note</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-secondary">Loading payments…</td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-secondary">No payments recorded yet.</td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="border-b border-theme/50">
                    <td className="py-3 pr-3">{row.payment_date}</td>
                    <td className="py-3 pr-3">
                      {row.invoice_number ? (
                        <Link href={`/invoices?invoice=${row.invoice_id}`} className="text-accent-theme hover:underline">
                          {row.invoice_number}
                        </Link>
                      ) : (
                        row.invoice_id
                      )}
                    </td>
                    <td className="py-3 pr-3">
                      {row.request_id ? (
                        <Link href={`/requests/${row.request_id}`} className="text-accent-theme hover:underline">
                          {row.request_id}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="py-3 pr-3 uppercase">{row.payment_method.replace(/_/g, ' ')}</td>
                    <td className="py-3 pr-3">{row.reference_number || '—'}</td>
                    <td className="py-3 pr-3 text-right font-medium">{row.currency} {row.amount.toFixed(2)}</td>
                    <td className="py-3 pr-3 text-secondary">{row.note || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
