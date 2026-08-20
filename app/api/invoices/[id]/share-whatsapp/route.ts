import { createInvoicePublicPdfLink, getInvoice, invoicePreviewModel, markInvoiceSent } from '@/services/invoice.service'
import { fail, ok, requireAdmin } from '@/app/api/invoices/_guard'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAdmin(request)
    const { id } = await params
    const invoice = await getInvoice(id)
    if (invoice.invoice.status === 'draft') {
      throw new Error('Finalize the invoice before sharing.')
    }
    const model = invoicePreviewModel(invoice)
    const pdfUrl = await createInvoicePublicPdfLink(id, user.email || user.id)

    const text = [
      `Dear ${model.client.name},`,
      '',
      `Please find your LankaLux invoice: ${model.invoiceNumber}.`,
      `Travel dates: ${model.formatted.travelStart} - ${model.formatted.travelEnd}.`,
      '',
      `Invoice PDF: ${pdfUrl}`,
      model.journey.secureLink ? `Journey link: ${model.journey.secureLink}` : '',
      '',
      'Warm regards,',
      'LankaLux',
    ]
      .filter(Boolean)
      .join('\n')

    const phone = model.client.phone ? model.client.phone.replace(/\D/g, '') : ''
    const href = phone
      ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}`
      : `https://wa.me/?text=${encodeURIComponent(text)}`

    await markInvoiceSent(id, user.email || user.id, 'whatsapp')
    return ok({ message: text, href, pdf_url: pdfUrl })
  } catch (error) {
    return fail(error)
  }
}
