import { logActivity } from '@/services/activity.service'
import { createShareLink } from '@/services/share.service'
import { renderWhatsAppMessage, withQuotedPrice } from '@/services/journey-copy'
import { getRequest } from '@/services/request.service'
import { AppError } from '@/services/supabase.server'
import { recordCommunication } from '@/services/email.service'

function digits(phone: string) {
  return phone.replace(/\D/g, '')
}

export async function prepareWhatsApp(opts: {
  requestId: string
  actor?: string
  includePrice?: boolean
  price?: string | null
}) {
  const request = await getRequest(opts.requestId)
  const phone = digits(request.whatsapp || '')
  if (!phone) throw new AppError('WhatsApp number is missing for this client.', 400)

  const share = await createShareLink({
    requestId: opts.requestId,
    actor: opts.actor,
    sendOptions: {
      channel: 'whatsapp',
      includePrice: !!opts.includePrice,
      price: opts.price || null,
    },
  })
  const journey = withQuotedPrice(share.journey, opts.includePrice, opts.price)
  const message = renderWhatsAppMessage({ journey, shareUrl: share.url })
  const href = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`

  await recordCommunication({
    requestId: opts.requestId,
    channel: 'whatsapp',
    recipient: phone,
    body: message,
    shareToken: share.token,
    status: 'sent',
  })
  await logActivity({
    request_id: opts.requestId,
    actor: opts.actor,
    event_type: 'whatsapp_shared',
    detail: { shareToken: share.token, url: share.url },
  })

  return { href, message, shareUrl: share.url, token: share.token, phone }
}
