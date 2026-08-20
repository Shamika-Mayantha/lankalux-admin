import { invoiceEmailBody, invoicePreviewModel, getInvoice, markInvoiceSent } from '@/services/invoice.service'
import { renderInvoicePdf } from '@/services/invoice-pdf'
import { fail, ok, readJson, requireAdmin } from '@/app/api/invoices/_guard'

const nodemailer = require('nodemailer')

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

    const host = process.env.SMTP_HOST
    const port = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587
    const userName = process.env.SMTP_USER
    const pass = process.env.SMTP_PASS || process.env.SMTP_PASSWORD
    const from = process.env.SMTP_FROM || userName || 'hello@lankalux.com'
    if (!host || !userName || !pass) {
      throw new Error('Email service is not configured.')
    }

    const pdfBytes = await renderInvoicePdf(model)
    const email = invoiceEmailBody(model)

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user: userName, pass },
      tls: { rejectUnauthorized: false },
    })

    await transporter.sendMail({
      from: `"LankaLux" <${from}>`,
      to: toEmail,
      subject: email.subject,
      text: email.text,
      html: `<p>Dear ${model.client.name},</p>
<p>Please find attached your LankaLux invoice for your upcoming Sri Lanka journey.</p>
<p><strong>Invoice:</strong> ${model.invoiceNumber}<br/>
<strong>Travel dates:</strong> ${model.formatted.travelStart} - ${model.formatted.travelEnd}</p>
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
