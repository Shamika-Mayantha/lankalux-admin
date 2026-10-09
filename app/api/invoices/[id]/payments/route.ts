import {
  addInvoicePayment,
  deleteInvoicePayment,
  getInvoice,
  invoicePreviewModel,
  updateInvoicePayment,
  type PaymentInput,
} from '@/services/invoice.service'
import { ApiError, fail, ok, readJson, requireInvoiceAccess } from '@/app/api/invoices/_guard'
import { getServiceClient } from '@/services/supabase.server'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await requireInvoiceAccess(request, id)
    const invoice = await getInvoice(id)
    return ok({ invoice, preview: invoicePreviewModel(invoice) })
  } catch (error) {
    return fail(error)
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const user = await requireInvoiceAccess(request, id)
    const payload = await readJson<PaymentInput>(request)
    const invoice = await addInvoicePayment(id, payload, user.email || user.id)
    return ok({ invoice, preview: invoicePreviewModel(invoice) }, 201)
  } catch (error) {
    return fail(error)
  }
}

/** Agents may only touch payments on invoices they can see. */
async function assertPaymentOnInvoice(paymentId: string, invoiceId: string) {
  const { data } = await getServiceClient().from('invoice_payments').select('invoice_id').eq('id', paymentId).maybeSingle()
  if (!data || String(data.invoice_id) !== invoiceId) throw new ApiError('Payment not found.', 404)
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const user = await requireInvoiceAccess(request, id)
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
    await assertPaymentOnInvoice(body.payment_id, id)
    const invoice = await updateInvoicePayment(body.payment_id, body, user.email || user.id)
    return ok({ invoice, preview: invoicePreviewModel(invoice) })
  } catch (error) {
    return fail(error)
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const user = await requireInvoiceAccess(request, id)
    const body = await readJson<{ payment_id?: string }>(request)
    if (!body.payment_id) throw new Error('payment_id is required.')
    await assertPaymentOnInvoice(body.payment_id, id)
    const invoice = await deleteInvoicePayment(body.payment_id, user.email || user.id)
    return ok({ invoice, preview: invoicePreviewModel(invoice) })
  } catch (error) {
    return fail(error)
  }
}
