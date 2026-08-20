import {
  duplicateInvoice,
  finalizeInvoice,
  getInvoice,
  invoicePreviewModel,
  markInvoiceSent,
  refreshDraftInvoice,
  updateDraftInvoice,
} from '@/services/invoice.service'
import { fail, ok, readJson, requireAdmin } from '@/app/api/invoices/_guard'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin(request)
    const { id } = await params
    const invoice = await getInvoice(id)
    return ok({
      invoice,
      preview: invoicePreviewModel(invoice),
    })
  } catch (error) {
    return fail(error)
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAdmin(request)
    const { id } = await params
    const patch = await readJson<{
      invoice_date?: string
      due_date?: string | null
      currency?: string
      package_total?: number
      package_description?: string
      client_note?: string | null
      secure_journey_url?: string | null
      payment_instructions?: Record<string, unknown>
    }>(request)
    const invoice = await updateDraftInvoice(id, patch, user.email || user.id)
    return ok({
      invoice,
      preview: invoicePreviewModel(invoice),
    })
  } catch (error) {
    return fail(error)
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAdmin(request)
    const { id } = await params
    const body = await readJson<{ action?: 'refresh' | 'finalize' | 'duplicate' | 'mark_sent'; channel?: 'email' | 'whatsapp' }>(request)
    let invoice
    switch (body.action) {
      case 'refresh':
        invoice = await refreshDraftInvoice(id, user.email || user.id)
        break
      case 'finalize':
        invoice = await finalizeInvoice(id, user.email || user.id)
        break
      case 'duplicate':
        invoice = await duplicateInvoice(id, user.email || user.id)
        break
      case 'mark_sent':
        invoice = await markInvoiceSent(id, user.email || user.id, body.channel)
        break
      default:
        throw new Error('Unsupported action.')
    }
    return ok({
      invoice,
      preview: invoicePreviewModel(invoice),
    })
  } catch (error) {
    return fail(error)
  }
}
