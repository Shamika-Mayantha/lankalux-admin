/** "2026-10-12" → "12 Oct 2026". Leaves anything it can't parse as-is. */
export function formatDay(value: string | null | undefined): string {
  if (!value) return '—'
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (!m) return value
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

/** Compact travel range: "12 – 20 Oct 2026", "28 Oct – 3 Nov 2026". */
export function formatDayRange(start: string | null | undefined, end: string | null | undefined): string {
  if (!start && !end) return '—'
  if (!start || !end) return `${formatDay(start)} → ${formatDay(end)}`
  const a = formatDay(start).split(' ')
  const b = formatDay(end).split(' ')
  if (a.length !== 3 || b.length !== 3) return `${formatDay(start)} → ${formatDay(end)}`
  if (a[2] === b[2] && a[1] === b[1]) return a[0] === b[0] ? formatDay(start) : `${a[0]} – ${b.join(' ')}`
  if (a[2] === b[2]) return `${a[0]} ${a[1]} – ${b.join(' ')}`
  return `${a.join(' ')} – ${b.join(' ')}`
}

/** "3 minutes ago", "yesterday", "12 Oct". */
export function formatAgo(value: string | null | undefined): string {
  if (!value) return ''
  const t = new Date(value).getTime()
  if (Number.isNaN(t)) return ''
  const mins = Math.round((Date.now() - t) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.round(hours / 24)
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days} days ago`
  return new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}
