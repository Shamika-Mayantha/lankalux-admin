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

function dates(j: CanonicalJourney) {
  return [j.startDate, j.endDate].filter(Boolean).join(' – ') || 'Dates to be confirmed'
}

export function withQuotedPrice(
  journey: CanonicalJourney,
  includePrice?: boolean,
  price?: string | null
): CanonicalJourney {
  const quoted = (price ?? journey.price ?? '').trim()
  return { ...journey, price: includePrice && quoted ? quoted : null }
}

export function withVehicleIncluded(journey: CanonicalJourney, includeVehicle?: boolean): CanonicalJourney {
  return { ...journey, vehicle: includeVehicle === false ? null : journey.vehicle }
}

export function renderJourneyEmail(opts: {
  journey: CanonicalJourney
  introduction: string
  shareUrl: string
  includeHotels?: boolean
  includeVehicle?: boolean
  logoUrl: string
}): { subject: string; html: string; text: string } {
  const { journey: j, introduction, shareUrl, includeHotels, includeVehicle, logoUrl } = opts
  const subject = `LankaLux Journey — ${j.title}`
  const vehicleBlock =
    includeVehicle !== false && j.vehicle
      ? `<h3 style="color:#B18544;font-family:'Be Vietnam Pro',Arial,sans-serif;font-size:12px;letter-spacing:.14em;text-transform:uppercase;font-weight:600;">Your vehicle</h3><p style="margin:0 0 12px;"><strong style="color:#1A2A1D;">${esc(j.vehicle.name)}</strong>${j.vehicle.description ? `<br/>${esc(j.vehicle.description)}` : ''}</p>`
      : ''
  const hotelBlock =
    includeHotels && j.hotels.length
      ? `<h3 style="color:#B18544;font-family:'Be Vietnam Pro',Arial,sans-serif;font-size:12px;letter-spacing:.14em;text-transform:uppercase;font-weight:600;">Suggested stays</h3>${j.hotels
          .map(
            (h) =>
              `<p style="margin:0 0 12px;"><strong style="color:#1A2A1D;">${esc(h.name)}</strong><br/>${esc(h.destination)} · ${esc(h.star_category)}<br/>${esc(h.room_category)} ${h.meal_plan ? '· ' + esc(h.meal_plan) : ''}</p>`
          )
          .join('')}`
      : ''

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;background:#F9F4EB;font-family:'Open Sans',Segoe UI,Arial,sans-serif;color:#252523;">
  <div style="max-width:620px;margin:24px auto;background:#fff;border:1px solid rgba(26,42,29,0.12);">
    <div style="background:#F9F4EB;padding:28px 20px;text-align:center;">
      <img src="${esc(logoUrl)}" alt="LankaLux" width="220" style="display:block;width:220px;height:auto;margin:0 auto;"/>
    </div>
    <div style="height:1px;background:#B18544;"></div>
    <div style="padding:28px;">
      <p>Dear ${esc(j.clientName.split(' ')[0] || 'Guest')},</p>
      <p style="color:#6b6b66;line-height:1.75;">${esc(introduction).replace(/\n/g, '<br/>')}</p>
      <div style="background:#F1E9DA;border-left:3px solid #B18544;padding:12px 14px;margin:20px 0;">
        <p style="margin:0 0 8px;color:#1A2A1D;font-size:18px;font-family:'Be Vietnam Pro',Arial,sans-serif;font-weight:600;">${esc(j.title)}</p>
        <p style="margin:0;font-size:13px;color:#6b6b66;">${esc(dates(j))}<br/>${esc(metaLine(j))}</p>
        ${j.price ? `<p style="margin:10px 0 0;color:#B18544;font-size:18px;font-family:'Be Vietnam Pro',Arial,sans-serif;font-weight:600;">${esc(j.price)}</p>` : ''}
      </div>
      ${vehicleBlock}
      ${hotelBlock}
      <p style="text-align:center;margin:28px 0;">
        <a href="${esc(shareUrl)}" style="background:#1A2A1D;color:#F9F4EB;text-decoration:none;padding:14px 28px;border-radius:0;font-weight:500;letter-spacing:.02em;font-size:14px;font-family:'Open Sans',Arial,sans-serif;display:inline-block;">View your complete journey</a>
      </p>
      <p style="font-size:13px;color:#6b6b66;">If you would like any changes, simply reply to this email.</p>
      <p>Warm regards,<br/><strong style="color:#1A2A1D;">${esc(BRAND.name)}</strong><br/><span style="color:#B18544;">${esc(BRAND.tagline)}</span></p>
    </div>
  </div>
</body></html>`

  const text = [
    `Dear ${j.clientName.split(' ')[0] || 'Guest'},`,
    '',
    introduction,
    '',
    j.title,
    dates(j),
    metaLine(j),
    ...(j.price ? [j.price] : []),
    ...(includeVehicle !== false && j.vehicle ? ['', 'Vehicle', `${j.vehicle.name}${j.vehicle.description ? ` — ${j.vehicle.description}` : ''}`] : []),
    '',
    'View your complete itinerary:',
    shareUrl,
    '',
    'Warm regards,',
    BRAND.name,
    BRAND.tagline,
  ].join('\n')

  return { subject, html, text }
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
