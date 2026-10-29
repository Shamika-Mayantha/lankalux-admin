import { randomBytes } from 'crypto'
import { publicJourneyUrl } from '@/config/env'
import { logActivity } from '@/services/activity.service'
import { addInvoicePayment } from '@/services/invoice.service'
import { latestShareToken } from '@/services/share.service'
import { AppError, getServiceClient, isMissingTableError } from '@/services/supabase.server'

/**
 * Revolut Pro has no API, so links are made by hand in the Revolut app and pasted here.
 * The branded pay page only opens Revolut's checkout; card details never touch LankaLux.
 */

export type PaymentLinkStatus = 'open' | 'paid' | 'cancelled'

export type PaymentLink = {
  token: string
  request_id: string
  label: string
  amount: number
  currency: string
  provider_url: string
  note: string
  status: PaymentLinkStatus
  first_opened_at: string | null
  paid_at: string | null
  paid_by: string | null
  invoice_payment_id: string | null
  created_by: string | null
  created_at: string
  pay_url: string
}

export type PublicPaymentLink = {
  label: string
  amount: number
  currency: string
  note: string
  status: PaymentLinkStatus
  provider_url: string | null
  client_first_name: string | null
  start_date: string | null
  end_date: string | null
  journey_url: string | null
}

export const PAYMENT_LABELS = ['Deposit', 'Balance', 'Full payment', 'Extra'] as const
export const PAYMENT_CURRENCIES = ['GBP', 'EUR', 'USD', 'AUD', 'LKR'] as const

const ALLOWED_HOSTS = new Set(['checkout.revolut.com', 'revolut.me'])

/** Only real Revolut checkout links: the pay page must never send a client anywhere else. */
export function cleanRevolutUrl(raw: unknown): string {
  const text = String(raw ?? '').trim()
  let url: URL
  try {
    url = new URL(text)
  } catch {
    throw new AppError('Paste the full Revolut link, starting with https://', 400)
  }
  if (url.protocol !== 'https:' || !ALLOWED_HOSTS.has(url.hostname) || url.pathname.length < 2) {
    throw new AppError('That is not a Revolut payment link. It should start with https://checkout.revolut.com/', 400)
  }
  return url.toString()
}

export function payUrl(token: string) {
  return `${publicJourneyUrl()}/pay/${token}`
}

function makeToken() {
  return randomBytes(12).toString('base64url')
}

function toLink(row: Record<string, unknown>): PaymentLink {
  const token = String(row.token)
  return {
    token,
    request_id: String(row.request_id),
    label: String(row.label || 'Deposit'),
    amount: Number(row.amount) || 0,
    currency: String(row.currency || 'GBP'),
    provider_url: String(row.provider_url || ''),
    note: String(row.note || ''),
    status: (['open', 'paid', 'cancelled'].includes(String(row.status)) ? row.status : 'open') as PaymentLinkStatus,
    first_opened_at: (row.first_opened_at as string) || null,
    paid_at: (row.paid_at as string) || null,
    paid_by: (row.paid_by as string) || null,
    invoice_payment_id: (row.invoice_payment_id as string) || null,
    created_by: (row.created_by as string) || null,
    created_at: String(row.created_at || ''),
    pay_url: payUrl(token),
  }
}

function tableMissing(error: unknown): never {
  if (isMissingTableError(error)) {
    throw new AppError('Payment links are not set up yet: the payment_links table needs to be created in Supabase.', 503)
  }
  throw new AppError(error instanceof Error ? error.message : String((error as { message?: string })?.message || error), 500)
}

export async function listPaymentLinks(requestId: string): Promise<PaymentLink[]> {
  const { data, error } = await getServiceClient()
    .from('payment_links')
    .select('*')
    .eq('request_id', requestId)
    .order('created_at', { ascending: false })
  if (error) tableMissing(error)
  return (data || []).map((r) => toLink(r as Record<string, unknown>))
}

export async function createPaymentLink(requestId: string, body: Record<string, unknown>, actor?: string | null): Promise<PaymentLink> {
  const amount = Math.round(Number(body.amount) * 100) / 100
  if (!Number.isFinite(amount) || amount <= 0) throw new AppError('Enter the amount the client pays.', 400)
  const currency = String(body.currency || 'GBP').toUpperCase()
  if (!(PAYMENT_CURRENCIES as readonly string[]).includes(currency)) throw new AppError('Pick a currency.', 400)
  const label = String(body.label || 'Deposit').trim().slice(0, 40) || 'Deposit'
  const row = {
    token: makeToken(),
    request_id: requestId,
    label,
    amount,
    currency,
    provider_url: cleanRevolutUrl(body.provider_url),
    note: String(body.note || '').trim().slice(0, 500),
    created_by: actor || null,
  }
  const { data, error } = await getServiceClient().from('payment_links').insert(row).select('*').single()
  if (error) tableMissing(error)
  await logActivity({ request_id: requestId, actor: actor || null, event_type: 'payment_link_created', detail: { token: row.token, label, amount, currency } })
  return toLink(data as Record<string, unknown>)
}

async function getLink(token: string): Promise<PaymentLink> {
  const { data, error } = await getServiceClient().from('payment_links').select('*').eq('token', token).maybeSingle()
  if (error) tableMissing(error)
  if (!data) throw new AppError('Payment link not found.', 404)
  return toLink(data as Record<string, unknown>)
}

export async function paymentLinkRequestId(token: string): Promise<string> {
  return (await getLink(token)).request_id
}

/** The newest live invoice in the same currency, so a payment never lands on a draft or a mismatched total. */
async function invoiceFor(requestId: string, currency: string): Promise<string | null> {
  const { data } = await getServiceClient()
    .from('invoices')
    .select('id, status, currency')
    .eq('request_id', requestId)
    .not('status', 'in', '(draft,cancelled)')
    .order('created_at', { ascending: false })
    .limit(5)
  const match = (data || []).find((r) => String(r.currency || '').toUpperCase() === currency)
  return match ? String(match.id) : null
}

export async function markPaymentLinkPaid(token: string, actor?: string | null): Promise<{ link: PaymentLink; invoiceRecorded: boolean }> {
  const link = await getLink(token)
  if (link.status === 'paid') return { link, invoiceRecorded: !!link.invoice_payment_id }
  if (link.status === 'cancelled') throw new AppError('This link was cancelled.', 400)

  const sb = getServiceClient()
  let paymentId: string | null = null
  const invoiceId = await invoiceFor(link.request_id, link.currency)
  if (invoiceId) {
    const bundle = await addInvoicePayment(
      invoiceId,
      {
        amount: link.amount,
        currency: link.currency,
        payment_date: new Date().toISOString().slice(0, 10),
        payment_method: 'online_payment',
        reference_number: 'Revolut',
        note: `${link.label} via Revolut link`,
      },
      actor || undefined
    )
    const newest = [...bundle.payments].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0]
    paymentId = newest?.id || null
  }

  const { data, error } = await sb
    .from('payment_links')
    .update({ status: 'paid', paid_at: new Date().toISOString(), paid_by: actor || null, invoice_payment_id: paymentId })
    .eq('token', token)
    .eq('status', 'open')
    .select('*')
    .maybeSingle()
  if (error) tableMissing(error)
  await logActivity({
    request_id: link.request_id,
    actor: actor || null,
    event_type: 'payment_link_paid',
    detail: { token, label: link.label, amount: link.amount, currency: link.currency, invoice_id: invoiceId },
  })
  return { link: data ? toLink(data as Record<string, unknown>) : await getLink(token), invoiceRecorded: !!paymentId }
}

export async function cancelPaymentLink(token: string, actor?: string | null): Promise<PaymentLink> {
  const link = await getLink(token)
  if (link.status === 'paid') throw new AppError('This link is already paid. Edit the invoice payment instead.', 400)
  const { data, error } = await getServiceClient()
    .from('payment_links')
    .update({ status: 'cancelled' })
    .eq('token', token)
    .select('*')
    .single()
  if (error) tableMissing(error)
  await logActivity({ request_id: link.request_id, actor: actor || null, event_type: 'payment_link_cancelled', detail: { token, label: link.label } })
  return toLink(data as Record<string, unknown>)
}

/** What the client's pay page may show: no staff names, no other requests, the Revolut URL only while open. */
export async function getPublicPaymentLink(token: string, opts: { trackOpen?: boolean } = {}): Promise<PublicPaymentLink | null> {
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(token)) return null
  const sb = getServiceClient()
  const { data, error } = await sb.from('payment_links').select('*').eq('token', token).maybeSingle()
  if (error || !data) return null
  const link = toLink(data as Record<string, unknown>)

  const { data: req } = await sb
    .from('Client Requests')
    .select('client_name, start_date, end_date')
    .eq('id', link.request_id)
    .maybeSingle()
  const journeyToken = await latestShareToken(link.request_id)

  if (opts.trackOpen && !link.first_opened_at && link.status === 'open') {
    await sb.from('payment_links').update({ first_opened_at: new Date().toISOString() }).eq('token', token).is('first_opened_at', null)
    await logActivity({ request_id: link.request_id, actor: 'client', event_type: 'payment_link_opened', detail: { token, label: link.label } })
  }

  const name = String((req as { client_name?: string } | null)?.client_name || '').trim()
  return {
    label: link.label,
    amount: link.amount,
    currency: link.currency,
    note: link.note,
    status: link.status,
    provider_url: link.status === 'open' ? link.provider_url : null,
    client_first_name: name ? name.split(/\s+/)[0] : null,
    start_date: (req as { start_date?: string } | null)?.start_date || null,
    end_date: (req as { end_date?: string } | null)?.end_date || null,
    journey_url: journeyToken ? `${publicJourneyUrl()}/journey/${journeyToken}` : null,
  }
}
