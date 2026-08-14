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

function dates(j: CanonicalJourney) {
  return [j.startDate, j.endDate].filter(Boolean).join(' – ') || 'Dates to be confirmed'
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
      ? `<h3 style="color:#c9a14a;font-family:Georgia,serif;">Suggested stays</h3>${j.hotels
          .map(
            (h) =>
              `<p style="margin:0 0 12px;"><strong>${esc(h.name)}</strong><br/>${esc(h.destination)} · ${esc(h.star_category)}<br/>${esc(h.room_category)} ${h.meal_plan ? '· ' + esc(h.meal_plan) : ''}</p>`
          )
          .join('')}`
      : ''

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;background:#efefef;font-family:Georgia,'Times New Roman',serif;color:#2f2f2f;">
  <div style="max-width:620px;margin:24px auto;background:#fff;border:1px solid #e2e2e2;">
    <div style="background:#1b1c1f;padding:28px 20px;text-align:center;">
      <img src="${esc(logoUrl)}" alt="LankaLux" width="56" height="56" style="border-radius:50%;object-fit:cover;"/>
      <h1 style="margin:12px 0 0;color:#c9a14a;font-weight:500;font-size:32px;">LankaLux</h1>
      <p style="margin:6px 0 0;color:#f2f2f2;letter-spacing:.14em;font-size:11px;text-transform:uppercase;">Journey</p>
    </div>
    <div style="height:2px;background:#c9a14a;"></div>
    <div style="padding:28px;">
      <p>Dear ${esc(j.clientName.split(' ')[0] || 'Guest')},</p>
      <p style="color:#5d5d5d;line-height:1.75;">${esc(introduction).replace(/\n/g, '<br/>')}</p>
      <div style="background:#f4f4f4;border-left:3px solid #c9a14a;padding:12px 14px;margin:20px 0;">
        <p style="margin:0 0 8px;color:#c9a14a;font-size:18px;">${esc(j.title)}</p>
        <p style="margin:0;font-size:13px;">${esc(dates(j))}<br/>${esc(j.durationLabel)} · ${esc(partyLine(j))}</p>
      </div>
      ${hotelBlock}
      <p style="text-align:center;margin:28px 0;">
        <a href="${esc(shareUrl)}" style="background:#c9a14a;color:#1b1c1f;text-decoration:none;padding:12px 26px;border-radius:4px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;font-size:12px;font-family:Arial,sans-serif;">View your complete journey</a>
      </p>
      <p style="font-size:13px;color:#666;">If you would like any changes, simply reply to this email.</p>
      <p>Warm regards,<br/><strong style="color:#c9a14a;">${esc(BRAND.name)}</strong><br/>${esc(BRAND.tagline)}</p>
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
    `${j.durationLabel} · ${partyLine(j)}`,
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
