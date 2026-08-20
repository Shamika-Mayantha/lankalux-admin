'use client'

import { useParams } from 'next/navigation'
import { InvoiceWorkspace } from '@/features/invoices/InvoiceWorkspace'

export default function InvoiceDetailPage() {
  const params = useParams<{ id: string }>()
  return (
    <div>
      <h1 className="ll-h1">Invoice</h1>
      <p className="ll-sub">Review, finalize, download and send the client-facing document.</p>
      <InvoiceWorkspace invoiceId={params.id} compact />
    </div>
  )
}
