import { createInvoiceFromRequest, listInvoices, invoicePreviewModel } from '@/services/invoice.service'
import { fail, ok, readJson, requireAdmin } from '@/app/api/invoices/_guard'

export async function GET(request: Request) {
  try {
    await requireAdmin(request)
    const { searchParams } = new URL(request.url)
    const requestId = searchParams.get('request_id') || undefined
    const invoices = await listInvoices({ requestId })
    return ok({
      invoices: invoices.map((bundle) => ({
        ...bundle,
        preview: invoicePreviewModel(bundle),
      })),
    })
  } catch (error) {
    return fail(error)
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAdmin(request)
    const body = await readJson<{ request_id?: string }>(request)
    if (!body.request_id) throw new Error('request_id is required.')
    const created = await createInvoiceFromRequest(body.request_id, user.email || user.id)
    return ok({
      invoice: created,
      preview: invoicePreviewModel(created),
    }, 201)
  } catch (error) {
    return fail(error)
  }
}
