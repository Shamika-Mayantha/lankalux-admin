import { NextResponse } from 'next/server'
import { logActivity } from '@/services/activity.service'
import { recordCommunication } from '@/services/email.service'
import { fetchReceivedEmail, isStaffAddress, requestIdFromReplyAddress, verifyResendWebhook } from '@/services/mailer'
import { getServiceClient } from '@/services/supabase.server'

export const maxDuration = 30

type ReceivedEvent = {
  type?: string
  data?: { email_id?: string; to?: string[]; cc?: string[]; received_for?: string[] }
}

function htmlToText(html: string): string {
  return html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Resend calls this when a client replies to an email sent from admin. */
export async function POST(request: Request) {
  const raw = await request.text()
  if (!verifyResendWebhook(raw, request.headers)) {
    return NextResponse.json({ success: false, error: 'Invalid signature' }, { status: 401 })
  }

  let event: ReceivedEvent
  try {
    event = JSON.parse(raw)
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 })
  }
  const emailId = event.data?.email_id
  if (event.type !== 'email.received' || !emailId) return NextResponse.json({ success: true, ignored: true })

  const addresses = [...(event.data?.to || []), ...(event.data?.cc || []), ...(event.data?.received_for || [])]
  const signedId = addresses.map(requestIdFromReplyAddress).find(Boolean)
  if (!signedId) {
    console.warn('[email/inbound] no request reply address in', addresses.join(', '))
    return NextResponse.json({ success: true, ignored: true })
  }

  const supabase = getServiceClient()
  const { data: requests } = await supabase.from('Client Requests').select('id').ilike('id', signedId.replace(/[%_\\]/g, '\\$&'))
  const requestId = requests?.[0]?.id ? String(requests[0].id) : null
  if (!requestId) return NextResponse.json({ success: true, ignored: true })

  // Resend retries webhooks; store each received email once.
  const { data: existing } = await supabase.from('communications').select('id').eq('provider_message_id', emailId).maybeSingle()
  if (existing) return NextResponse.json({ success: true, duplicate: true })

  const email = await fetchReceivedEmail(emailId)
  const text = (email.text || '').trim() || htmlToText(email.html || '')
  const attachments = (email.attachments || []).map((a) => a.filename).filter(Boolean)
  const body = attachments.length ? `${text}\n\n[Attachments: ${attachments.join(', ')}]` : text

  // A team member who answers from Zoho with Reply all also copies the reply address, so admin
  // logs their answer as a sent email rather than as a client reply.
  if (isStaffAddress(email.from)) {
    await recordCommunication({
      requestId,
      channel: 'email',
      recipient: (email.to || []).filter((a) => !requestIdFromReplyAddress(a)).join(', '),
      subject: email.subject || undefined,
      body,
      shareToken: null,
      providerMessageId: emailId,
      status: 'sent',
      direction: 'outbound',
      fromAddress: email.from,
      messageId: email.message_id,
    })
    await logActivity({
      request_id: requestId,
      actor: email.from,
      event_type: 'email_reply_sent',
      detail: { from: email.from, subject: email.subject, via: 'zoho' },
    })
    return NextResponse.json({ success: true, staff: true })
  }

  await recordCommunication({
    requestId,
    channel: 'email',
    recipient: (email.to || []).join(', '),
    subject: email.subject || undefined,
    body,
    shareToken: null,
    providerMessageId: emailId,
    status: 'received',
    direction: 'inbound',
    fromAddress: email.from,
    messageId: email.message_id,
  })
  await logActivity({
    request_id: requestId,
    actor: email.from,
    event_type: 'email_received',
    detail: { from: email.from, subject: email.subject },
  })
  return NextResponse.json({ success: true })
}
