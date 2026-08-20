'use client'

import { InvoiceWorkspace } from '@/features/invoices/InvoiceWorkspace'
import '@/components/invoices/invoice.css'

export default function InvoicesPage() {
  return (
    <div>
      <h1 className="ll-h1">Invoices</h1>
      <p className="ll-sub">Official LankaLux invoices, generated from confirmed journeys in this console.</p>
      <InvoiceWorkspace compact />
    </div>
  )
}
