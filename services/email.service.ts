import { appUrl, publicJourneyUrl } from '@/config/env'
import { deliverMail, formatAddress, replyAddressFor, requireMailer, senderFor, type MailAttachment } from '@/services/mailer'
import { BRAND } from '@/config/brand'
import { logActivity } from '@/services/activity.service'
import { getPublishedItinerary } from '@/services/itinerary.service'
import { createShareLink } from '@/services/share.service'
import { renderFollowUpEmail, renderInvoiceEmail, renderJourneyEmail, withQuotedPrice, withVehicleIncluded } from '@/services/journey-copy'
import { getInvoice, invoicePreviewModel, markInvoiceSent } from '@/services/invoice.service'
import { renderInvoicePdf } from '@/services/invoice-pdf'
import { getServiceClient, AppError, isMissingTableError } from '@/services/supabase.server'
import { getRequest } from '@/services/request.service'
import {
  getTemplate,
  followUpBcc,
  followUpCtas,
  normalizeEditableBody,
  trustpilotAfsSnippet,
  type TemplateId,
} from '@/lib/email-templates'

/** The staff member sending, so agents send from their own @lankalux.com address. */
export type MailSender = { id?: string | null; email?: string | null; name?: string | null }

async function sendLankaLuxMail(opts: {
  to: string
  subject: string
  text: string
  html: string
  bcc?: string | null
  attachments?: MailAttachment[]
  requestId?: string
  shareToken?: string | null
  sender?: MailSender | null
  inReplyTo?: string | null
}): Promise<{ messageId: string }> {
  const from = senderFor(opts.sender)
  // A client's Reply goes to the sender's own Zoho inbox (where the team replies) and to the
  // request's reply address, which keeps a copy in admin. Both carry the sender's name.
  const replyTo = opts.requestId ? replyAddressFor(opts.requestId) : null
  const base = {
    requestId: opts.requestId || '',
    channel: 'email' as const,
    recipient: opts.to,
    subject: opts.subject,
    body: opts.text,
    shareToken: opts.shareToken ?? null,
    fromAddress: from.address,
    sentBy: opts.sender?.id || null,
  }

  let messageId = ''
  try {
    const result = await deliverMail({
      from,
      to: opts.to,
      replyTo: replyTo ? [formatAddress(from), formatAddress({ name: from.name, address: replyTo })] : null,
      bcc: opts.bcc,
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
      attachments: opts.attachments,
      inReplyTo: opts.inReplyTo,
    })
    messageId = result.messageId
  } catch (err) {
    if (opts.requestId) {
      await recordCommunication({ ...base, status: 'failed', error: err instanceof Error ? err.message : String(err) })
    }
    throw err
  }

  if (opts.requestId) {
    await recordCommunication({ ...base, providerMessageId: messageId, status: 'sent' })
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
    shareUrl: `${publicJourneyUrl()}/journey`,
    includeHotels: opts.includeHotels,
    logoUrl: `${appUrl()}${BRAND.logoEmailHeaderSrc}`,
  })
  return { ...compiled, journey }
}

export async function sendInvoiceEmail(opts: { invoiceId: string; to?: string; actor?: string; sender?: MailSender | null }) {
  requireMailer()
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
    logoUrl: `${appUrl()}${BRAND.logoEmailHeaderSrc}`,
  })
  const pdfBytes = await renderInvoicePdf(model)

  const { messageId } = await sendLankaLuxMail({
    to,
    subject: compiled.subject,
    text: compiled.text,
    html: compiled.html,
    requestId: bundle.invoice.request_id,
    shareToken: bundle.invoice.share_link_token,
    sender: opts.sender,
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
  sender?: MailSender | null
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
  requireMailer()
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

  const logoUrl = `${appUrl()}${BRAND.logoEmailHeaderSrc}`
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
    sender: opts.sender,
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
  sender?: MailSender | null
}) {
  requireMailer()
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
  const ctas = followUpCtas(template.id).map((cta) => ({ url: cta.ctaUrl, label: cta.ctaLabel }))
  const bcc = followUpBcc(template.id)
  const compiled = renderFollowUpEmail({
    clientName,
    bodyText: normalizedBody,
    logoUrl: `${appUrl()}${BRAND.logoEmailHeaderSrc}`,
    ctas,
    extraHtml: bcc ? trustpilotAfsSnippet({ recipientName: clientName, recipientEmail: to, referenceId: opts.requestId }) : undefined,
  })
  const html = compiled.html
  const text = compiled.text

  const { messageId } = await sendLankaLuxMail({
    to,
    bcc,
    subject,
    text,
    html,
    requestId: opts.requestId,
    sender: opts.sender,
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
    detail: { to, subject, templateId: template.id, templateName: template.name, trustpilotAfs: Boolean(bcc) },
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
  status: 'sent' | 'failed' | 'received'
  error?: string
  direction?: 'outbound' | 'inbound'
  fromAddress?: string | null
  sentBy?: string | null
  messageId?: string | null
}) {
  const supabase = getServiceClient()
  const base = {
    request_id: row.requestId,
    channel: row.channel,
    recipient: row.recipient,
    subject: row.subject || null,
    body: row.body,
    share_token: row.shareToken,
    provider_message_id: row.providerMessageId || null,
    status: row.status,
    error: row.error || null,
  }
  const threaded = {
    ...base,
    direction: row.direction || 'outbound',
    from_address: row.fromAddress || null,
    sent_by: row.sentBy || null,
    message_id: row.messageId || null,
  }
  let { error } = await supabase.from('communications').insert(threaded)
  // Before the email_threads migration runs, keep logging outgoing mail the old way.
  if (error && isMissingTableError(error) && row.status !== 'received') {
    ;({ error } = await supabase.from('communications').insert(base))
  }
  if (error && !isMissingTableError(error)) console.error('communications', error.message)
}

export type EmailMessage = {
  id: string
  direction: 'outbound' | 'inbound'
  from_address: string | null
  recipient: string | null
  subject: string | null
  body: string | null
  status: string
  error: string | null
  created_at: string
}

/** Every email on a request, oldest first. Callers check request access. */
export async function listRequestEmails(requestId: string): Promise<EmailMessage[]> {
  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from('communications')
    .select('*')
    .eq('request_id', requestId)
    .eq('channel', 'email')
    .order('created_at', { ascending: true })
    .limit(200)
  if (error) {
    if (isMissingTableError(error)) return []
    throw new AppError(`Supabase request failed: ${error.message}`, 500)
  }
  return (data || []).map((r) => ({
    id: String(r.id),
    direction: r.direction === 'inbound' ? 'inbound' : 'outbound',
    from_address: r.from_address ?? null,
    recipient: r.recipient ?? null,
    subject: r.subject ?? null,
    body: r.body ?? null,
    status: String(r.status),
    error: r.error ?? null,
    created_at: String(r.created_at),
  }))
}

/** A plain reply from the request page, threaded onto the client's last email when there is one. */
export async function sendReplyEmail(opts: { requestId: string; body: string; subject?: string; sender: MailSender }) {
  requireMailer()
  const bodyText = normalizeEditableBody(opts.body || '').trim()
  if (!bodyText) throw new AppError('Write a message first.', 400)
  const request = await getRequest(opts.requestId)
  const to = (request.email || '').trim()
  if (!to) throw new AppError('Client email is missing.', 400)

  const supabase = getServiceClient()
  const { data: lastIn } = await supabase
    .from('communications')
    .select('subject, message_id')
    .eq('request_id', opts.requestId)
    .eq('direction', 'inbound')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const lastSubject = (lastIn?.subject as string | null) || ''
  const subject =
    opts.subject?.trim() ||
    (lastSubject ? (/^re:/i.test(lastSubject) ? lastSubject : `Re: ${lastSubject}`) : 'A note from LankaLux')

  const compiled = renderFollowUpEmail({
    clientName: request.client_name || 'Valued Client',
    bodyText,
    logoUrl: `${appUrl()}${BRAND.logoEmailHeaderSrc}`,
    ctas: [],
  })
  const { messageId } = await sendLankaLuxMail({
    to,
    subject,
    text: compiled.text,
    html: compiled.html,
    requestId: opts.requestId,
    sender: opts.sender,
    inReplyTo: (lastIn?.message_id as string | null) || null,
  })
  await logActivity({
    request_id: opts.requestId,
    actor: opts.sender.email || undefined,
    event_type: 'email_reply_sent',
    detail: { to, subject },
  })
  return { messageId, subject, to }
}

export { recordCommunication }
