export type HotelEmailPayload = {
  name: string
  location?: string
  mapsUrl?: string
  starRating?: string
  roomType?: string
  showPrice?: boolean
  pricePerNight?: string
  description?: string
  images?: string[]
}

export function formatItineraryDaysPlain(option: {
  days?: string | { day: number; title: string; location: string; activities?: string[] }[]
}): string {
  if (!option?.days) return ''
  if (Array.isArray(option.days)) {
    return option.days
      .map(
        (day) =>
          `Day ${day.day}: ${day.title} — ${day.location}\n${(day.activities || []).map((a) => `  • ${a}`).join('\n')}`
      )
      .join('\n\n')
  }
  return String(option.days)
}

export function formatItineraryDaysHtml(option: {
  days?: string | { day: number; title: string; location: string; activities?: string[] }[]
}): string {
  if (!option?.days) return '<p>No day details.</p>'
  if (Array.isArray(option.days)) {
    return option.days
      .map((day) => {
        const acts = (day.activities || []).map((a) => `<li style="margin:6px 0;color:#555;">${escapeHtml(a)}</li>`).join('')
        return `
          <div style="margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid #e0e0e0;">
            <p style="color:#c8a45d;font-weight:700;margin:0 0 8px;">Day ${day.day}: ${escapeHtml(day.title)}</p>
            <p style="color:#666;margin:0 0 10px;font-size:14px;">${escapeHtml(day.location)}</p>
            <ul style="margin:0;padding-left:18px;">${acts || '<li style="color:#999;">—</li>'}</ul>
          </div>`
      })
      .join('')
  }
  return `<pre style="white-space:pre-wrap;font-family:Georgia,serif;font-size:14px;color:#444;line-height:1.6;">${escapeHtml(String(option.days))}</pre>`
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function buildHotelSectionHtml(h: HotelEmailPayload): string {
  const imgs = (h.images || [])
    .filter(Boolean)
    .slice(0, 8)
    .map(
      (url) =>
        `<a href="${escapeHtml(url)}" target="_blank" rel="noopener"><img src="${escapeHtml(url)}" alt="" style="max-width:100%;height:auto;border-radius:8px;margin:8px 0;max-height:220px;object-fit:cover;" /></a>`
    )
    .join('')
  const mapLine = h.mapsUrl
    ? `<p style="margin:8px 0;"><a href="${escapeHtml(h.mapsUrl)}" style="color:#c8a45d;">View on Google Maps</a></p>`
    : ''
  const price =
    h.showPrice && h.pricePerNight
      ? `<p style="margin:12px 0;font-size:16px;color:#c8a45d;font-weight:600;">${escapeHtml(h.pricePerNight)} <span style="color:#666;font-weight:400;font-size:14px;">per night</span></p>`
      : ''
  return `
    <div style="margin-top:32px;padding-top:24px;border-top:3px solid #c8a45d;">
      <h2 style="color:#c8a45d;font-size:20px;letter-spacing:2px;margin:0 0 20px;text-transform:uppercase;">— Hotel details —</h2>
      <p style="font-size:22px;font-weight:700;color:#2c2c2c;margin:0 0 8px;">${escapeHtml(h.name)}</p>
      <p style="color:#666;margin:0 0 4px;">${escapeHtml(h.location || '')}</p>
      ${mapLine}
      <p style="margin:12px 0;color:#444;"><strong>Room:</strong> ${escapeHtml(h.roomType || '—')} &nbsp;·&nbsp; <strong>Rating:</strong> ${escapeHtml(h.starRating || '—')}</p>
      ${price}
      ${h.description ? `<p style="color:#555;line-height:1.8;margin:16px 0;">${escapeHtml(h.description)}</p>` : ''}
      ${imgs ? `<div style="margin-top:16px;">${imgs}</div>` : ''}
    </div>
  `
}

export function buildHotelSectionPlain(h: HotelEmailPayload): string {
  const lines = [
    '--- HOTEL DETAILS ---',
    h.name,
    h.location || '',
    h.mapsUrl ? `Maps: ${h.mapsUrl}` : '',
    `Room: ${h.roomType || '—'} | Rating: ${h.starRating || '—'}`,
    h.showPrice && h.pricePerNight ? `Price: ${h.pricePerNight} / night` : '',
    h.description || '',
    (h.images || []).length ? `Images:\n${(h.images || []).join('\n')}` : '',
  ]
  return lines.filter(Boolean).join('\n')
}

export function buildItinerarySectionPlain(title: string, daysBlock: string, itineraryUrl: string): string {
  return [
    '--- ITINERARY ---',
    title,
    '',
    daysBlock,
    '',
    `View full journey: ${itineraryUrl}`,
  ].join('\n')
}
