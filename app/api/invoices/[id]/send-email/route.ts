import nodemailer from 'nodemailer'
import { requireSmtp } from '@/config/env'
import { invoiceEmailBody, invoicePreviewModel, getInvoice, markInvoiceSent } from '@/services/invoice.service'
import { renderInvoicePdf } from '@/services/invoice-pdf'
import { fail, ok, readJson, requireAdmin } from '@/app/api/invoices/_guard'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAdmin(request)
    const { id } = await params
    const body = await readJson<{ to?: string }>(request)
    const invoice = await getInvoice(id)
    if (invoice.invoice.status === 'draft') {
      throw new Error('Finalize the invoice before sending.')
    }

    const model = invoicePreviewModel(invoice)
    const toEmail = body.to?.trim() || model.client.email
    if (!toEmail) throw new Error('Client email is required.')

    const smtp = requireSmtp()
    const pdfBytes = await renderInvoicePdf(model)
    const email = invoiceEmailBody(model)

    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.port === 465,
      auth: { user: smtp.user, pass: smtp.pass },
      tls: { rejectUnauthorized: false },
    })

    await transporter.sendMail({
      from: `"LankaLux" <${smtp.from}>`,
      to: toEmail,
      subject: email.subject,
      text: email.text,
      html: `<p>Dear ${model.client.name},</p>
<p>Please find attached your LankaLux invoice for your upcoming Sri Lanka journey.</p>
<p><strong>Invoice:</strong> ${model.invoiceNumber}<br/>
<strong>Travel dates:</strong> ${model.formatted.travelStart} – ${model.formatted.travelEnd}</p>
<p>You can also view your complete journey using the link below.</p>
<p><a href="${model.journey.secureLink || '#'}" style="display:inline-block;background:#1A2A1D;color:#F9F4EB;padding:12px 20px;border:1px solid #B18544;text-decoration:none;">VIEW YOUR JOURNEY</a></p>
<p>Warm regards,<br/>LankaLux</p>`,
      attachments: [
        {
          filename: `${model.invoiceNumber}.pdf`,
          content: Buffer.from(pdfBytes),
          contentType: 'application/pdf',
        },
      ],
    })

    await markInvoiceSent(id, user.email || user.id, 'email')
    return ok({ message: 'Invoice email sent successfully.' })
  } catch (error) {
    return fail(error)
  }
}
