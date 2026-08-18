import nodemailer from 'nodemailer'
import { appUrl, requireSmtp } from '@/config/env'
import { BRAND } from '@/config/brand'
import { logActivity } from '@/services/activity.service'
import { getPublishedItinerary } from '@/services/itinerary.service'
import { createShareLink } from '@/services/share.service'
import { renderJourneyEmail, withQuotedPrice, withVehicleIncluded } from '@/services/journey-copy'
import { getServiceClient, AppError, isMissingTableError } from '@/services/supabase.server'
import { getRequest } from '@/services/request.service'

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
  const smtp = requireSmtp()
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
      from: `"LankaLux" <hello@lankalux.com>`,
      replyTo: 'hello@lankalux.com',
      to,
      subject,
      text: compiled.text,
      html: compiled.html,
    })
    messageId = result.messageId || ''
  } catch (err) {
    const anyErr = err as { responseCode?: number; message?: string }
    const code = anyErr.responseCode ? ` ${anyErr.responseCode}` : ''
    const msg = anyErr.message || 'Unknown SMTP error'
    await recordCommunication({
      requestId: opts.requestId,
      channel: 'email',
      recipient: to,
      subject,
      body: compiled.text,
      shareToken,
      status: 'failed',
      error: `Email API returned${code}: ${msg}`,
    })
    throw new AppError(`Email API returned${code}: ${msg}`, 502)
  }

  await recordCommunication({
    requestId: opts.requestId,
    channel: 'email',
    recipient: to,
    subject,
    body: compiled.text,
    shareToken,
    providerMessageId: messageId,
    status: 'sent',
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
