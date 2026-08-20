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

function renderBrandedClientEmail(opts: {
  firstName: string
  introduction: string
  highlightTitle: string
  highlightBodyHtml: string
  extraHtml?: string
  ctaUrl?: string
  ctaLabel?: string
  logoUrl: string
  textLines: string[]
}): { html: string; text: string } {
  const cta =
    opts.ctaUrl && opts.ctaLabel
      ? `<p style="text-align:center;margin:28px 0;">
        <a href="${esc(opts.ctaUrl)}" style="background:#1A2A1D;color:#F9F4EB;text-decoration:none;padding:14px 28px;border-radius:0;font-weight:500;letter-spacing:.02em;font-size:14px;font-family:'Open Sans',Arial,sans-serif;display:inline-block;border:1px solid #B18544;">${esc(opts.ctaLabel)}</a>
      </p>`
      : ''

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;background:#FFFFFF;font-family:'Open Sans',Segoe UI,Arial,sans-serif;color:#252523;">
  <div style="max-width:620px;margin:24px auto;background:#fff;border:1px solid rgba(26,42,29,0.12);">
    <div style="background:#F9F4EB;padding:28px 20px;text-align:center;">
      <img src="${esc(opts.logoUrl)}" alt="LankaLux" width="220" style="display:block;width:220px;height:auto;margin:0 auto;"/>
    </div>
    <div style="height:1px;background:#B18544;"></div>
    <div style="padding:28px;">
      <p>Dear ${esc(opts.firstName)},</p>
      <p style="color:#6b6b66;line-height:1.75;">${esc(opts.introduction).replace(/\n/g, '<br/>')}</p>
      <div style="background:#F1E9DA;border-left:3px solid #B18544;padding:12px 14px;margin:20px 0;">
        <p style="margin:0 0 8px;color:#1A2A1D;font-size:18px;font-family:'Be Vietnam Pro',Arial,sans-serif;font-weight:600;">${esc(opts.highlightTitle)}</p>
        <p style="margin:0;font-size:13px;color:#6b6b66;">${opts.highlightBodyHtml}</p>
      </div>
      ${opts.extraHtml || ''}
      ${cta}
      <p style="font-size:13px;color:#6b6b66;">If you would like any changes, simply reply to this email.</p>
      <p>Warm regards,<br/><strong style="color:#1A2A1D;">${esc(BRAND.name)}</strong><br/><span style="color:#B18544;">${esc(BRAND.tagline)}</span></p>
    </div>
  </div>
</body></html>`

  return { html, text: opts.textLines.join('\n') }
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
