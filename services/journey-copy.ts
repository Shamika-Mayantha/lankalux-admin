import { BRAND } from '@/config/brand'
import type { CanonicalJourney } from '@/types/domain'

function esc(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function partyLine(j: CanonicalJourney) {
  const bits = [`${j.party.adults} adult${j.party.adults === 1 ? '' : 's'}`]
  if (j.party.children) bits.push(`${j.party.children} child${j.party.children === 1 ? '' : 'ren'}`)
  return bits.join(', ')
}

function metaLine(j: CanonicalJourney) {
  return [j.durationLabel, partyLine(j)].filter(Boolean).join(' · ')
}

function formatEmailDate(value: string | null) {
  if (!value) return null
  const parsed = new Date(`${value}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return value
  const day = String(parsed.getDate()).padStart(2, '0')
  const month = parsed.toLocaleDateString('en-US', { month: 'short' })
  const year = parsed.getFullYear()
  return `${day}-${month}-${year}`
}

function dates(j: CanonicalJourney) {
  const start = formatEmailDate(j.startDate)
  const end = formatEmailDate(j.endDate)
  return [start, end].filter(Boolean).join(' – ') || 'Dates to be confirmed'
}

export function withQuotedPrice(
  journey: CanonicalJourney,
  includePrice?: boolean,
  price?: string | null
): CanonicalJourney {
  const quoted = (price ?? journey.price ?? '').trim()
  return { ...journey, price: includePrice && quoted ? quoted : null }
}

export function withVehicleIncluded(
  journey: CanonicalJourney,
  includeVehicle?: boolean,
  vehicleOverride?: CanonicalJourney['vehicle']
): CanonicalJourney {
  if (includeVehicle === false) return { ...journey, vehicle: null }
  if (vehicleOverride) return { ...journey, vehicle: vehicleOverride }
  return journey
}

function firstName(fullName: string) {
  return fullName.trim().split(' ')[0] || 'Guest'
}

export type EmailCta = { url: string; label: string }

function resolveCtas(opts: {
  ctas?: EmailCta[]
  ctaUrl?: string | null
  ctaLabel?: string | null
}): EmailCta[] {
  const fromArray = (opts.ctas || [])
    .map((cta) => ({ url: cta.url?.trim() || '', label: cta.label?.trim() || '' }))
    .filter((cta) => cta.url && cta.label)
  if (fromArray.length) return fromArray
  const url = opts.ctaUrl?.trim()
  const label = opts.ctaLabel?.trim()
  return url && label ? [{ url, label }] : []
}

function ctaButtonHtml(cta: EmailCta, variant: 'primary' | 'secondary') {
  const style =
    variant === 'primary'
      ? "background:#1A2A1D;color:#F9F4EB;text-decoration:none;padding:14px 28px;border-radius:0;font-weight:500;letter-spacing:.02em;font-size:14px;font-family:'Open Sans',Arial,sans-serif;display:inline-block;border:1px solid #B18544;"
      : "background:#F9F4EB;color:#1A2A1D;text-decoration:none;padding:14px 28px;border-radius:0;font-weight:500;letter-spacing:.02em;font-size:14px;font-family:'Open Sans',Arial,sans-serif;display:inline-block;border:1px solid #B18544;"
  return `<a href="${esc(cta.url)}" style="${style}">${esc(cta.label)}</a>`
}

function renderCtaBlock(ctas: EmailCta[]) {
  if (!ctas.length) return ''
  return ctas
    .map((cta, index) => {
      const margin = index === 0 ? '28px 0 12px' : index === ctas.length - 1 ? '0 0 28px' : '0 0 12px'
      return `<p style="text-align:center;margin:${margin};">${ctaButtonHtml(cta, index === 0 ? 'primary' : 'secondary')}</p>`
    })
    .join('')
}

function emailIvoryPixelUrl(logoUrl: string) {
  if (/^https?:\/\//i.test(logoUrl)) {
    try {
      return `${new URL(logoUrl).origin}/brand/email-ivory.jpg`
    } catch {
      return 'https://admin.lankalux.com/brand/email-ivory.jpg'
    }
  }
  if (logoUrl.startsWith('/')) return '/brand/email-ivory.jpg'
  return logoUrl.replace(/[^/]+$/, 'email-ivory.jpg')
}

function emailLogoHeader(logoUrl: string) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#F9F4EB" style="border-collapse:collapse;background-color:#F9F4EB;">
      <tr>
        <td align="center" valign="middle" bgcolor="#F9F4EB" style="padding:0;margin:0;background-color:#F9F4EB;text-align:center;line-height:0;font-size:0;">
          <a href="${esc(BRAND.websiteUrl)}" target="_blank" rel="noopener noreferrer" style="display:block;text-decoration:none;border:0;outline:none;line-height:0;">
            <img src="${esc(logoUrl)}" alt="LankaLux" width="620" border="0" style="display:block;width:100%;max-width:620px;height:auto;border:0;outline:none;text-decoration:none;background-color:#F9F4EB;" />
          </a>
        </td>
      </tr>
    </table>`
}

function renderBrandedClientEmail(opts: {
  firstName: string
  introduction?: string
  bodyHtml?: string
  highlightTitle?: string
  highlightBodyHtml?: string
  extraHtml?: string
  ctaUrl?: string
  ctaLabel?: string
  ctas?: EmailCta[]
  logoUrl: string
  textLines: string[]
}): { html: string; text: string } {
  const cta = renderCtaBlock(resolveCtas(opts))

  const body = opts.bodyHtml
    ? opts.bodyHtml
    : opts.introduction
      ? `<p class="ll-muted" style="color:#6b6b66;line-height:1.75;">${esc(opts.introduction).replace(/\n/g, '<br/>')}</p>`
      : ''

  const highlight =
    opts.highlightTitle && opts.highlightBodyHtml
      ? `<div class="ll-cream" style="background-color:#F1E9DA;border-left:3px solid #B18544;padding:12px 14px;margin:20px 0;">
        <p class="ll-ink" style="margin:0 0 8px;color:#1A2A1D;font-size:18px;font-family:'Be Vietnam Pro',Arial,sans-serif;font-weight:600;">${esc(opts.highlightTitle)}</p>
        <p class="ll-muted" style="margin:0;font-size:13px;color:#6b6b66;">${opts.highlightBodyHtml}</p>
      </div>`
      : ''

  const ivoryPixel = emailIvoryPixelUrl(opts.logoUrl)
  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><meta name="color-scheme" content="light only"/><meta name="supported-color-schemes" content="light"/>
<style type="text/css">
:root { color-scheme: light only; }
body, table, td, div, p { color-scheme: light only; }
@media (prefers-color-scheme: dark) {
  .ll-bg, .ll-card, .ll-pad, body { background-color:#F9F4EB !important; background:#F9F4EB !important; color:#252523 !important; }
  .ll-cream { background-color:#F1E9DA !important; }
  .ll-muted { color:#6b6b66 !important; }
  .ll-ink { color:#1A2A1D !important; }
  .ll-gold { color:#B18544 !important; }
}
[data-ogsc] .ll-bg, [data-ogsc] .ll-card, [data-ogsc] .ll-pad { background-color:#F9F4EB !important; color:#252523 !important; }
</style>
</head>
<body class="ll-bg" bgcolor="#F9F4EB" style="margin:0;padding:0;background-color:#F9F4EB;background-image:url('${esc(ivoryPixel)}');font-family:'Open Sans',Segoe UI,Arial,sans-serif;color:#252523;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F9F4EB" class="ll-bg" style="border-collapse:collapse;background-color:#F9F4EB;background-image:url('${esc(ivoryPixel)}');">
    <tr>
      <td align="center" bgcolor="#F9F4EB" class="ll-bg" style="padding:16px 10px;background-color:#F9F4EB;">
        <table role="presentation" width="620" cellpadding="0" cellspacing="0" border="0" bgcolor="#F9F4EB" class="ll-card" style="width:100%;max-width:620px;border-collapse:collapse;background-color:#F9F4EB;">
          <tr>
            <td bgcolor="#F9F4EB" class="ll-card" style="padding:0;background-color:#F9F4EB;">
              ${emailLogoHeader(opts.logoUrl)}
            </td>
          </tr>
          <tr>
            <td bgcolor="#F9F4EB" class="ll-pad" style="padding:28px;background-color:#F9F4EB;color:#252523;">
              <p class="ll-ink" style="color:#252523;">Dear ${esc(opts.firstName)},</p>
              ${body}
              ${highlight}
              ${opts.extraHtml || ''}
              ${cta}
              <p class="ll-muted" style="font-size:13px;color:#6b6b66;">If you would like any changes, simply reply to this email.</p>
              <p class="ll-ink" style="color:#252523;">Warm regards,<br/><strong style="color:#1A2A1D;">${esc(BRAND.name)}</strong><br/><span class="ll-gold" style="color:#B18544;">${esc(BRAND.tagline)}</span></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body></html>`

  return { html, text: opts.textLines.join('\n') }
}

export function renderFollowUpEmail(opts: {
  clientName: string
  bodyText: string
  logoUrl: string
  ctaUrl?: string | null
  ctaLabel?: string | null
  ctas?: EmailCta[]
  extraHtml?: string
}): { html: string; text: string } {
  const name = firstName(opts.clientName)
  const paragraphs = opts.bodyText
    .trim()
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
  const bodyHtml = paragraphs
    .map((p) => `<p class="ll-muted" style="color:#6b6b66;line-height:1.75;">${esc(p).replace(/\n/g, '<br/>')}</p>`)
    .join('')
  const ctas = resolveCtas(opts)
  const compiled = renderBrandedClientEmail({
    firstName: name,
    bodyHtml,
    ctas,
    logoUrl: opts.logoUrl,
    textLines: [
      `Dear ${name},`,
      '',
      opts.bodyText.trim(),
      '',
      ...ctas.flatMap((cta) => [cta.label, cta.url, '']),
      'If you would like any changes, simply reply to this email.',
      '',
      'Warm regards,',
      BRAND.name,
      BRAND.tagline,
    ],
  })
  if (!opts.extraHtml) return compiled
  return {
    ...compiled,
    html: compiled.html.replace('</body>', `${opts.extraHtml}</body>`),
  }
}

export function renderJourneyEmail(opts: {
  journey: CanonicalJourney
  introduction: string
  shareUrl: string
  includeHotels?: boolean
  logoUrl: string
}): { subject: string; html: string; text: string } {
  const { journey: j, introduction, shareUrl, includeHotels, logoUrl } = opts
  const subject = `LankaLux Journey — ${j.title}`
  const hotelBlock =
    includeHotels && j.hotels.length
      ? `<h3 style="color:#B18544;font-family:'Be Vietnam Pro',Arial,sans-serif;font-size:12px;letter-spacing:.14em;text-transform:uppercase;font-weight:600;">Suggested stays</h3>${j.hotels
          .map(
            (h) =>
              `<p style="margin:0 0 12px;"><strong style="color:#1A2A1D;">${esc(h.name)}</strong><br/>${esc(h.destination)} · ${esc(h.star_category)}<br/>${esc(h.room_category)} ${h.meal_plan ? '· ' + esc(h.meal_plan) : ''}</p>`
          )
          .join('')}`
      : ''
  const name = firstName(j.clientName)
  const compiled = renderBrandedClientEmail({
    firstName: name,
    introduction,
    highlightTitle: j.title,
    highlightBodyHtml: `${esc(dates(j))}<br/>${esc(metaLine(j))}`,
    extraHtml: hotelBlock,
    ctaUrl: shareUrl,
    ctaLabel: 'View your LankaLux Journey',
    logoUrl,
    textLines: [
      `Dear ${name},`,
      '',
      introduction,
      '',
      j.title,
      dates(j),
      metaLine(j),
      '',
      'View your LankaLux Journey:',
      shareUrl,
      '',
      'Warm regards,',
      BRAND.name,
      BRAND.tagline,
    ],
  })
  return { subject, html: compiled.html, text: compiled.text }
}

export function renderInvoiceEmail(opts: {
  clientName: string
  invoiceNumber: string
  journeyTitle: string
  travelDates: string
  packageTotal: string
  balanceDue: string
  shareUrl: string | null
  logoUrl: string
}): { subject: string; html: string; text: string } {
  const name = firstName(opts.clientName)
  const introduction =
    'Please find attached your LankaLux invoice. Your complete journey details remain available on the secure link below.'
  const highlightLines = [
    `Invoice ${opts.invoiceNumber}`,
    opts.travelDates,
    `Package total ${opts.packageTotal}`,
    `Balance due ${opts.balanceDue}`,
  ]
  const compiled = renderBrandedClientEmail({
    firstName: name,
    introduction,
    highlightTitle: opts.journeyTitle,
    highlightBodyHtml: highlightLines.map((line) => esc(line)).join('<br/>'),
    ctaUrl: opts.shareUrl || undefined,
    ctaLabel: opts.shareUrl ? 'View your LankaLux Journey' : undefined,
    logoUrl: opts.logoUrl,
    textLines: [
      `Dear ${name},`,
      '',
      introduction,
      '',
      opts.journeyTitle,
      ...highlightLines,
      '',
      ...(opts.shareUrl ? ['View your LankaLux Journey:', opts.shareUrl, ''] : []),
      'Warm regards,',
      BRAND.name,
      BRAND.tagline,
    ],
  })
  return { subject: `LankaLux Invoice — ${opts.invoiceNumber}`, html: compiled.html, text: compiled.text }
}

export function renderWhatsAppMessage(opts: { journey: CanonicalJourney; shareUrl: string }): string {
  const { journey: j, shareUrl } = opts
  const first = j.clientName.split(' ')[0] || 'there'
  const nights = j.durationDays ? Math.max(j.durationDays - 1, 0) : null
  return [
    `Hello ${first},`,
    '',
    'Thank you for your interest in travelling with LankaLux.',
    '',
    "We've prepared your personalised Sri Lanka journey.",
    '',
    j.title,
    dates(j),
    nights != null ? `${nights} night${nights === 1 ? '' : 's'}` : j.durationLabel,
    ...(j.price ? [j.price] : []),
    '',
    'You can view your complete itinerary here:',
    '',
    shareUrl,
    '',
    "If you'd like us to make any changes, simply let us know.",
    '',
    'LankaLux',
    BRAND.tagline,
  ].join('\n')
}
