import nodemailer from 'nodemailer'
import { appUrl, requireSmtp } from '@/config/env'
import { BRAND } from '@/config/brand'
import { logActivity } from '@/services/activity.service'
import { getPublishedItinerary } from '@/services/itinerary.service'
import { createShareLink } from '@/services/share.service'
import { renderFollowUpEmail, renderInvoiceEmail, renderJourneyEmail, withQuotedPrice, withVehicleIncluded } from '@/services/journey-copy'
import { getInvoice, invoicePreviewModel, markInvoiceSent } from '@/services/invoice.service'
import { renderInvoicePdf } from '@/services/invoice-pdf'
import { getServiceClient, AppError, isMissingTableError } from '@/services/supabase.server'
import { getRequest } from '@/services/request.service'
import { getTemplate, followUpCta, normalizeEditableBody, type TemplateId } from '@/lib/email-templates'

const FROM_EMAIL = 'hello@lankalux.com'

type MailAttachment = {
  filename: string
  content: Buffer
  contentType?: string
}

async function sendLankaLuxMail(opts: {
  to: string
  subject: string
  text: string
  html: string
  attachments?: MailAttachment[]
  requestId?: string
  shareToken?: string | null
}): Promise<{ messageId: string }> {
  const smtp = requireSmtp()
  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.port === 465,
    auth: { user: smtp.user, pass: smtp.pass },
  })

  try {
    await transporter.verify()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new AppError(`Email API returned a configuration error: ${msg}`, 502)
  }

  let messageId = ''
  try {
    const result = await transporter.sendMail({
      from: `"LankaLux" <${FROM_EMAIL}>`,
      replyTo: FROM_EMAIL,
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
      attachments: opts.attachments,
    })
    messageId = result.messageId || ''
  } catch (err) {
    const anyErr = err as { responseCode?: number; message?: string }
    const code = anyErr.responseCode ? ` ${anyErr.responseCode}` : ''
    const msg = anyErr.message || 'Unknown SMTP error'
    if (opts.requestId) {
      await recordCommunication({
        requestId: opts.requestId,
        channel: 'email',
        recipient: opts.to,
        subject: opts.subject,
        body: opts.text,
        shareToken: opts.shareToken ?? null,
        status: 'failed',
        error: `Email API returned${code}: ${msg}`,
      })
    }
    throw new AppError(`Email API returned${code}: ${msg}`, 502)
  }

  if (opts.requestId) {
    await recordCommunication({
      requestId: opts.requestId,
      channel: 'email',
      recipient: opts.to,
      subject: opts.subject,
      body: opts.text,
      shareToken: opts.shareToken ?? null,
      providerMessageId: messageId,
      status: 'sent',
    })
  }

  return { messageId }
}

export async function previewJourneyEmail(opts: {
  requestId: string
  introduction?: string
  includeHotels?: boolean
  includeVehicle?: boolean
  vehicle?: { id: string; name: string; description: string; photos: string[] } | null
  includePrice?: boolean
  price?: string | null
}) {
  const journey = withVehicleIncluded(
    withQuotedPrice(await getPublishedItinerary(opts.requestId), opts.includePrice, opts.price),
    opts.includeVehicle,
    opts.vehicle
  )
  const introduction =
    opts.introduction?.trim() ||
    'We are delighted to share your personalised LankaLux Journey. Every day has been paced with care so you can travel beautifully, not hurriedly.'
  const compiled = renderJourneyEmail({
    journey,
    introduction,
    shareUrl: `${appUrl()}/journey`,
    includeHotels: opts.includeHotels,
    logoUrl: `${appUrl()}${BRAND.logoSrc}`,
  })
  return { ...compiled, journey }
}

export async function sendInvoiceEmail(opts: { invoiceId: string; to?: string; actor?: string }) {
  requireSmtp()
  const bundle = await getInvoice(opts.invoiceId)
  if (bundle.invoice.status === 'draft') throw new AppError('Finalize the invoice before sending.', 400)
  if (bundle.invoice.status === 'cancelled') throw new AppError('Cancelled invoice cannot be sent.', 400)

  const model = invoicePreviewModel(bundle)
  const to = (opts.to || model.client.email || '').trim()
  if (!to) throw new AppError('Client email is missing.', 400)

  const compiled = renderInvoiceEmail({
    clientName: model.client.name,
    invoiceNumber: model.invoiceNumber,
    journeyTitle: model.journey.title,
    travelDates: `${model.formatted.travelStart} – ${model.formatted.travelEnd}`,
    packageTotal: model.formatted.packageTotal,
    balanceDue: model.formatted.balanceDue,
    shareUrl: model.journey.secureLink || null,
    logoUrl: `${appUrl()}${BRAND.logoSrc}`,
  })
  const pdfBytes = await renderInvoicePdf(model)

  const { messageId } = await sendLankaLuxMail({
    to,
    subject: compiled.subject,
    text: compiled.text,
    html: compiled.html,
    requestId: bundle.invoice.request_id,
    shareToken: bundle.invoice.share_link_token,
    attachments: [
      {
        filename: `${model.invoiceNumber}.pdf`,
        content: Buffer.from(pdfBytes),
        contentType: 'application/pdf',
      },
    ],
  })

  await markInvoiceSent(opts.invoiceId, opts.actor, 'email')
  return { messageId, subject: compiled.subject, to }
}

export async function sendJourneyEmail(opts: {
  requestId: string
  actor?: string
  introduction?: string
  includeHotels?: boolean
  includeVehicle?: boolean
  vehicle?: { id: string; name: string; description: string; photos: string[] } | null
  includeItinerary?: boolean
  includePrice?: boolean
  price?: string | null
  subject?: string
  to?: string
}) {
  requireSmtp()
  const request = await getRequest(opts.requestId)
  const to = (opts.to || request.email || '').trim()
  if (!to) throw new AppError('Client email is missing.', 400)

  const includeItinerary = opts.includeItinerary !== false
  let shareUrl = ''
  let journey = null as Awaited<ReturnType<typeof getPublishedItinerary>> | null
  let shareToken: string | null = null

  if (includeItinerary) {
    const share = await createShareLink({
      requestId: opts.requestId,
      actor: opts.actor,
      sendOptions: {
        channel: 'email',
        includeHotels: !!opts.includeHotels,
        includeVehicle: opts.includeVehicle !== false,
        vehicle: opts.includeVehicle === false ? null : opts.vehicle,
        includePrice: !!opts.includePrice,
        price: opts.price || null,
      },
    })
    shareUrl = share.url
    journey = share.journey
    shareToken = share.token
  } else {
    journey = await getPublishedItinerary(opts.requestId).catch(() => null)
  }

  const introduction =
    opts.introduction?.trim() ||
    'We are delighted to share your personalised LankaLux Journey. Every day has been paced with care so you can travel beautifully, not hurriedly.'

  const logoUrl = `${appUrl()}${BRAND.logoSrc}`
  const compiled = journey
    ? renderJourneyEmail({
        journey: withVehicleIncluded(withQuotedPrice(journey, opts.includePrice, opts.price), opts.includeVehicle, opts.vehicle),
        introduction,
        shareUrl: shareUrl || appUrl(),
        includeHotels: opts.includeHotels,
        logoUrl,
      })
    : {
        subject: 'A note from LankaLux',
        html: `<p>${introduction}</p>`,
        text: introduction,
      }

  const subject = opts.subject?.trim() || compiled.subject
  const { messageId } = await sendLankaLuxMail({
    to,
    subject,
    text: compiled.text,
    html: compiled.html,
    requestId: opts.requestId,
    shareToken,
  })

  const supabase = getServiceClient()
  const now = new Date().toISOString()
  await supabase
    .from('Client Requests')
    .update({
      last_sent_at: now,
      sent_at: request.sent_at || now,
      email_sent_count: (request.email_sent_count || 0) + 1,
      status: request.status === 'cancelled' ? request.status : request.status === 'new' ? 'follow_up' : request.status,
      updated_at: now,
    })
    .eq('id', opts.requestId)

  await logActivity({
    request_id: opts.requestId,
    actor: opts.actor,
    event_type: 'email_sent',
    detail: { to, subject, shareToken, shareUrl: shareUrl || null },
  })

  return { messageId, shareUrl, subject, to }
}

export async function sendFollowUpTemplateEmail(opts: {
  requestId: string
  templateId: string
  subject?: string
  body?: string
  actor?: string
}) {
  requireSmtp()
  const template = getTemplate(opts.templateId as TemplateId)
  if (!template) throw new AppError('Invalid template ID', 400)

  const request = await getRequest(opts.requestId)
  const to = (request.email || '').trim()
  if (!to) throw new AppError('Client email is missing.', 400)

  if (opts.templateId === 'custom_email') {
    const sub = opts.subject?.trim() || ''
    const bod = opts.body?.trim() || ''
    if (!sub || !bod) throw new AppError('Custom email requires both a subject and a message.', 400)
  }

  const clientName = request.client_name || 'Valued Client'
  const subject = opts.subject?.trim() || template.subject
  const bodySource =
    opts.body != null && String(opts.body).trim() !== ''
      ? String(opts.body)
      : template.getText({ clientName })
  const normalizedBody = normalizeEditableBody(bodySource)
  const cta = followUpCta(template.id)
  const compiled = renderFollowUpEmail({
    clientName,
    bodyText: normalizedBody,
    logoUrl: `${appUrl()}${BRAND.logoSrc}`,
    ctaUrl: cta?.ctaUrl,
    ctaLabel: cta?.ctaLabel,
  })
  const html = compiled.html
  const text = compiled.text

  const { messageId } = await sendLankaLuxMail({
    to,
    subject,
    text,
    html,
    requestId: opts.requestId,
  })

  const now = new Date().toISOString()
  let followUpLog: { sent_at: string; template_id: string; template_name: string; subject: string }[] = []
  const rawLog = request.follow_up_emails_sent
  if (rawLog) {
    try {
      const parsed = JSON.parse(rawLog)
      followUpLog = Array.isArray(parsed) ? parsed : []
    } catch {
      followUpLog = []
    }
  }
  followUpLog.push({
    sent_at: now,
    template_id: template.id,
    template_name: template.name,
    subject,
  })
  if (followUpLog.length > 50) followUpLog = followUpLog.slice(-50)

  const supabase = getServiceClient()
  const { error } = await supabase
    .from('Client Requests')
    .update({
      follow_up_emails_sent: JSON.stringify(followUpLog),
      updated_at: now,
    })
    .eq('id', opts.requestId)
  if (error && !isMissingTableError(error)) console.error('follow_up_emails_sent update:', error.message)

  await logActivity({
    request_id: opts.requestId,
    actor: opts.actor,
    event_type: 'follow_up_email_sent',
    detail: { to, subject, templateId: template.id, templateName: template.name },
  })

  return { messageId, subject, to, templateName: template.name }
}

async function recordCommunication(row: {
  requestId: string
  channel: 'email' | 'whatsapp'
  recipient: string
  subject?: string
  body: string
  shareToken: string | null
  providerMessageId?: string
  status: 'sent' | 'failed'
  error?: string
}) {
  const supabase = getServiceClient()
  const { error } = await supabase.from('communications').insert({
    request_id: row.requestId,
    channel: row.channel,
    recipient: row.recipient,
    subject: row.subject || null,
    body: row.body,
    share_token: row.shareToken,
    provider_message_id: row.providerMessageId || null,
    status: row.status,
    error: row.error || null,
  })
  if (error && !isMissingTableError(error)) console.error('communications', error.message)
}

export { recordCommunication }
