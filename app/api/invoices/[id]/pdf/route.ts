import { addInvoiceActivity, getInvoice, invoicePreviewModel } from '@/services/invoice.service'
import { renderInvoicePdf } from '@/services/invoice-pdf'
import { fail, requireAdmin } from '@/app/api/invoices/_guard'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAdmin(request)
    const { id } = await params
    const invoice = await getInvoice(id)
    const model = invoicePreviewModel(invoice)
    const bytes = await renderInvoicePdf(model)
    await addInvoiceActivity(id, 'invoice_downloaded', { mode: 'admin' }, user.email || user.id)

    return new Response(Buffer.from(bytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${model.invoiceNumber}.pdf"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    return fail(error)
  }
}
