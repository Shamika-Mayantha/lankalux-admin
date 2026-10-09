import { createInvoiceFromRequest, listInvoices, invoicePreviewModel, previewInvoiceSource } from '@/services/invoice.service'
import { fail, ok, readJson, requireRequestAccess, requireStaff } from '@/app/api/invoices/_guard'
import { accessibleRequestIds } from '@/services/staff.service'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const requestId = searchParams.get('request_id') || undefined
    const { staff } = requestId ? await requireRequestAccess(request, requestId) : await requireStaff(request)
    const allowed = requestId ? null : await accessibleRequestIds(staff)
    const invoices = (await listInvoices({ requestId })).filter((b) => !allowed || allowed.has(b.invoice.request_id))
    const source = requestId ? await previewInvoiceSource(requestId) : null
    return ok({
      source,
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
    const body = await readJson<{ request_id?: string }>(request)
    if (!body.request_id) throw new Error('request_id is required.')
    const user = await requireRequestAccess(request, body.request_id)
    const created = await createInvoiceFromRequest(body.request_id, user.email || user.id)
    return ok({
      invoice: created,
      preview: invoicePreviewModel(created),
    }, 201)
  } catch (error) {
    return fail(error)
  }
}
