import {
  addInvoicePayment,
  deleteInvoicePayment,
  getInvoice,
  invoicePreviewModel,
  updateInvoicePayment,
  type PaymentInput,
} from '@/services/invoice.service'
import { fail, ok, readJson, requireAdmin } from '@/app/api/invoices/_guard'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin(request)
    const { id } = await params
    const invoice = await getInvoice(id)
    return ok({ invoice, preview: invoicePreviewModel(invoice) })
  } catch (error) {
    return fail(error)
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAdmin(request)
    const { id } = await params
    const payload = await readJson<PaymentInput>(request)
    const invoice = await addInvoicePayment(id, payload, user.email || user.id)
    return ok({ invoice, preview: invoicePreviewModel(invoice) }, 201)
  } catch (error) {
    return fail(error)
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireAdmin(request)
    const body = await readJson<{
      payment_id?: string
      amount?: number
      currency?: string
      payment_date?: string
      payment_method?: PaymentInput['payment_method']
      reference_number?: string | null
      note?: string | null
      status?: 'successful' | 'void'
    }>(request)
    if (!body.payment_id) throw new Error('payment_id is required.')
    const invoice = await updateInvoicePayment(body.payment_id, body, user.email || user.id)
    return ok({ invoice, preview: invoicePreviewModel(invoice) })
  } catch (error) {
    return fail(error)
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireAdmin(request)
    const body = await readJson<{ payment_id?: string }>(request)
    if (!body.payment_id) throw new Error('payment_id is required.')
    const invoice = await deleteInvoicePayment(body.payment_id, user.email || user.id)
    return ok({ invoice, preview: invoicePreviewModel(invoice) })
  } catch (error) {
    return fail(error)
  }
}
