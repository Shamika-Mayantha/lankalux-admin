import crypto from 'node:crypto'
import nodemailer from 'nodemailer'
import { AppError } from '@/services/supabase.server'

/**
 * Outgoing mail transport.
 *
 * With RESEND_API_KEY set, mail goes through Resend, which is verified for lankalux.com and can
 * send as any @lankalux.com address, so agents send as themselves. Without it, mail falls back
 * to the existing Zoho SMTP login, which can only send as hello@lankalux.com.
 *
 * With EMAIL_REPLY_DOMAIN set (e.g. reply.lankalux.com, whose MX points at Resend), each email
 * about a request gets a Reply-To address that encodes the request, so a client's reply comes
 * back into admin through /api/email/inbound.
 */

export const MAIN_ADDRESS = 'hello@lankalux.com'
const SENDER_DOMAIN = 'lankalux.com'

export type Sender = { name: string; address: string }
export type MailAttachment = { filename: string; content: Buffer; contentType?: string }

export function resendEnabled(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim())
}

function smtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && (process.env.SMTP_PASS || process.env.SMTP_PASSWORD))
}

export function requireMailer() {
  if (resendEnabled() || smtpConfigured()) return
  throw new AppError('Email is not configured. Set RESEND_API_KEY, or SMTP_HOST, SMTP_USER and SMTP_PASS.', 500)
}

/** Agents with an @lankalux.com login send as themselves; everyone else sends as hello@. */
export function senderFor(staff?: { email?: string | null; name?: string | null } | null): Sender {
  const email = (staff?.email || '').trim().toLowerCase()
  if (resendEnabled() && email.endsWith(`@${SENDER_DOMAIN}`) && email !== MAIN_ADDRESS) {
    const name = (staff?.name || '').trim()
    return { name: name && name !== email ? `${name} | LankaLux` : 'LankaLux', address: email }
  }
  return { name: 'LankaLux', address: MAIN_ADDRESS }
}

// Signed with the service-role key: server-only, always set, and rarely rotated.
function replySignature(requestId: string): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  return crypto.createHmac('sha256', key).update(`reply:${requestId.toLowerCase()}`).digest('hex').slice(0, 12)
}

function replyDomain(): string | null {
  const domain = (process.env.EMAIL_REPLY_DOMAIN || '').trim().toLowerCase()
  return domain && resendEnabled() ? domain : null
}

/** <request id>.<signature>@reply.lankalux.com, or null when replies into admin are off. */
export function replyAddressFor(requestId: string): string | null {
  const domain = replyDomain()
  if (!domain || !/^[A-Za-z0-9_-]+$/.test(requestId)) return null
  return `${requestId.toLowerCase()}.${replySignature(requestId).slice(0, 8)}@${domain}`
}

/**
 * Returns the lower-cased request ID an address was signed for, or null.
 * Also accepts the first format, r.<id>.<12-char signature>, used by emails already sent.
 */
export function requestIdFromReplyAddress(address: string): string | null {
  const m = address
    .trim()
    .toLowerCase()
    .match(/(?:^|[<\s])(?:r\.)?([a-z0-9_-]+)\.([a-f0-9]{12}|[a-f0-9]{8})@([a-z0-9.-]+)>?$/)
  if (!m) return null
  const expected = replySignature(m[1]).slice(0, m[2].length)
  const ok = crypto.timingSafeEqual(Buffer.from(m[2]), Buffer.from(expected))
  return ok ? m[1] : null
}

export function formatAddress(sender: Sender) {
  return `"${sender.name.replace(/"/g, '')}" <${sender.address}>`
}

export async function deliverMail(opts: {
  from: Sender
  to: string
  replyTo?: string | null
  bcc?: string | null
  subject: string
  text: string
  html: string
  attachments?: MailAttachment[]
  inReplyTo?: string | null
}): Promise<{ messageId: string }> {
  const replyTo = opts.replyTo || opts.from.address
  const threading = opts.inReplyTo ? { 'In-Reply-To': opts.inReplyTo, References: opts.inReplyTo } : undefined

  if (resendEnabled()) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: formatAddress(opts.from),
        to: [opts.to],
        bcc: opts.bcc ? [opts.bcc] : undefined,
        reply_to: [replyTo],
        subject: opts.subject,
        text: opts.text,
        html: opts.html,
        headers: threading,
        attachments: opts.attachments?.map((a) => ({
          filename: a.filename,
          content: a.content.toString('base64'),
          content_type: a.contentType,
        })),
      }),
    })
    const json = (await res.json().catch(() => ({}))) as { id?: string; message?: string }
    if (!res.ok) throw new AppError(`Email API returned ${res.status}: ${json.message || 'Unknown error'}`, 502)
    return { messageId: json.id || '' }
  }

  const host = process.env.SMTP_HOST
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS || process.env.SMTP_PASSWORD
  if (!host || !user || !pass) throw new AppError('Email is not configured.', 500)
  const port = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587
  const transporter = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } })
  try {
    await transporter.verify()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new AppError(`Email API returned a configuration error: ${msg}`, 502)
  }
  try {
    const result = await transporter.sendMail({
      from: formatAddress({ name: 'LankaLux', address: MAIN_ADDRESS }),
      replyTo,
      to: opts.to,
      bcc: opts.bcc || undefined,
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
      attachments: opts.attachments,
      headers: threading,
    })
    return { messageId: result.messageId || '' }
  } catch (err) {
    const anyErr = err as { responseCode?: number; message?: string }
    const code = anyErr.responseCode ? ` ${anyErr.responseCode}` : ''
    throw new AppError(`Email API returned${code}: ${anyErr.message || 'Unknown SMTP error'}`, 502)
  }
}

/** Verifies a Resend (Svix) webhook signature against the raw body. */
export function verifyResendWebhook(rawBody: string, headers: Headers): boolean {
  const secret = process.env.RESEND_WEBHOOK_SECRET || ''
  const id = headers.get('svix-id')
  const timestamp = headers.get('svix-timestamp')
  const signatures = headers.get('svix-signature')
  if (!secret || !id || !timestamp || !signatures) return false
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 5 * 60) return false
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64')
  const expected = crypto.createHmac('sha256', key).update(`${id}.${timestamp}.${rawBody}`).digest()
  return signatures.split(' ').some((part) => {
    const [version, sig] = part.split(',')
    if (version !== 'v1' || !sig) return false
    const given = Buffer.from(sig, 'base64')
    return given.length === expected.length && crypto.timingSafeEqual(given, expected)
  })
}

/** Fetches a received email's body; the webhook only carries metadata. */
export async function fetchReceivedEmail(emailId: string): Promise<{
  from: string
  to: string[]
  subject: string | null
  text: string | null
  html: string | null
  message_id: string | null
  attachments?: { filename?: string }[]
}> {
  const res = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}`, {
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
  })
  if (!res.ok) throw new AppError(`Resend returned ${res.status} for received email`, 502)
  return res.json()
}
