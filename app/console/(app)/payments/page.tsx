'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { consoleFetch } from '@/lib/console-api'

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

const METHOD_LABEL: Record<string, string> = {
  bank_transfer: 'Bank Transfer',
  card: 'Card',
  cash: 'Cash',
  online_payment: 'Online Payment',
  other: 'Other',
}

export default function PaymentsPage() {
  const [rows, setRows] = useState<PaymentRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    consoleFetch('/api/invoices/payments')
      .then((d) => setRows(d.payments || []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div>
      <h1 className="ll-h1">Payments</h1>
      <p className="ll-sub">Every recorded payment across LankaLux invoices.</p>
      {error && <div className="ll-error">{error}</div>}
      <table className="ll-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Invoice</th>
            <th>Request</th>
            <th>Method</th>
            <th>Reference</th>
            <th>Amount</th>
            <th>Note</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={7} className="ll-muted">
                Loading payments…
              </td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={7} className="ll-muted">
                No payments recorded yet.
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.id}>
                <td>{row.payment_date}</td>
                <td>
                  <Link href={`/console/invoices/${row.invoice_id}`}>{row.invoice_number || 'Invoice'}</Link>
                </td>
                <td>
                  {row.request_id ? <Link href={`/console/requests/${row.request_id}`}>{row.request_id}</Link> : '—'}
                </td>
                <td>{METHOD_LABEL[row.payment_method] || row.payment_method}</td>
                <td>{row.reference_number || '—'}</td>
                <td>
                  {row.currency} {Number(row.amount).toFixed(2)}
                </td>
                <td className="ll-muted">{row.note || '—'}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
