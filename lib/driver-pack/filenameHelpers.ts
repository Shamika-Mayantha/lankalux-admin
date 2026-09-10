const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function sanitizeFilename(value: string) {
  const cleaned = String(value || '')
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[_.]+|[_.]+$/g, '')
  return cleaned || 'LankaLux'
}

export function splitGuestNames(raw: string | null | undefined): string[] {
  const cleaned = String(raw || '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!cleaned) return []
  const parts = cleaned
    .split(/\s*(?:&+| and | \+| \/ |,|;)\s*/i)
    .map((part) => part.trim())
    .filter(Boolean)
  return parts.length ? parts : [cleaned]
}

function parseIsoDate(value: string | null | undefined) {
  const text = String(value || '').trim()
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null
  return { year, month, day }
}

export function formatDateLabel(value: string | null | undefined) {
  const parsed = parseIsoDate(value)
  if (!parsed) return String(value || '').trim()
  return `${parsed.day} ${MONTHS[parsed.month - 1]} ${parsed.year}`
}

export function formatLongDate(value: string | null | undefined) {
  const parsed = parseIsoDate(value)
  if (!parsed) return String(value || '').trim().toUpperCase()
  const date = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day))
  return date
    .toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
    .toUpperCase()
}

export function formatShortDate(value: string | null | undefined) {
  const parsed = parseIsoDate(value)
  if (!parsed) return String(value || '').trim()
  return `${parsed.day} ${MONTHS[parsed.month - 1]} ${parsed.year}`
}

export function formatDateRangeFilename(start: string | null | undefined, end: string | null | undefined) {
  const a = parseIsoDate(start)
  const b = parseIsoDate(end) || a
  if (!a) return ''
  if (!b || (a.year === b.year && a.month === b.month && a.day === b.day)) {
    return `${a.day}_${MONTHS[a.month - 1]}_${a.year}`
  }
  if (a.year === b.year && a.month === b.month) {
    return `${a.day}-${b.day}_${MONTHS[a.month - 1]}_${a.year}`
  }
  if (a.year === b.year) {
    return `${a.day}_${MONTHS[a.month - 1]}-${b.day}_${MONTHS[b.month - 1]}_${a.year}`
  }
  return `${a.day}_${MONTHS[a.month - 1]}_${a.year}-${b.day}_${MONTHS[b.month - 1]}_${b.year}`
}

export function guestFilenamePart(names: string[]) {
  return sanitizeFilename(names.join('_') || 'Guests')
}

export function driverPackFilenames(input: {
  guestNames: string[]
  startDate?: string | null
  endDate?: string | null
}) {
  const guests = guestFilenamePart(input.guestNames)
  const range = formatDateRangeFilename(input.startDate, input.endDate)
  const dated = range ? `${guests}_${range}` : guests
  return {
    journey: sanitizeFilename(`LankaLux_Driver_Journey_${dated}`) + '.pdf',
    log: sanitizeFilename(`LankaLux_Driver_Log_${dated}`) + '.pdf',
    paging: sanitizeFilename(`LankaLux_Paging_Board_${guests}`) + '.pdf',
    zip: sanitizeFilename(`LankaLux_Driver_Pack_${dated}`) + '.zip',
  }
}
