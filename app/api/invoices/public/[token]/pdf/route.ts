import { getInvoiceByPublicToken, invoicePreviewModel } from '@/services/invoice.service'
import { renderInvoicePdf } from '@/services/invoice-pdf'

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params
    const invoice = await getInvoiceByPublicToken(token)
    const model = invoicePreviewModel(invoice)
    const bytes = await renderInvoicePdf(model)
    return new Response(Buffer.from(bytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${model.invoiceNumber}.pdf"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invoice link is invalid.'
    return new Response(message, { status: 404 })
  }
}
