export type InvoiceStatus =
  | 'draft'
  | 'finalized'
  | 'sent'
  | 'partially_paid'
  | 'paid'
  | 'overdue'
  | 'cancelled'

export type InvoicePaymentStatus = 'unpaid' | 'partially_paid' | 'paid' | 'overdue'

export function amount(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return 0
  return Number(parsed.toFixed(2))
}

export function calculateTotals(
  packageTotal: number,
  payments: Array<{ amount: number; currency: string; status?: string }>,
  currency: string
) {
  const total = amount(packageTotal)
  const code = String(currency || 'USD').toUpperCase()
  const paid = payments
    .filter((p) => (p.status || 'successful') === 'successful' && String(p.currency || code).toUpperCase() === code)
    .reduce((sum, p) => sum + amount(p.amount), 0)
  const paidRounded = Number(paid.toFixed(2))
  return {
    total,
    paid: paidRounded,
    balance: Number(Math.max(total - paidRounded, 0).toFixed(2)),
  }
}

export function paymentStatus(
  total: number,
  paid: number,
  dueDate: string | null | undefined,
  now = Date.now()
): InvoicePaymentStatus {
  const overdue =
    !!dueDate &&
    (() => {
      const due = new Date(`${dueDate}T23:59:59`)
      return !Number.isNaN(due.getTime()) && now > due.getTime()
    })()

  if (paid <= 0) return overdue && total > 0 ? 'overdue' : 'unpaid'
  if (paid < total) return overdue ? 'overdue' : 'partially_paid'
  return 'paid'
}

export function invoiceStatus(base: InvoiceStatus, payment: InvoicePaymentStatus): InvoiceStatus {
  if (base === 'cancelled') return 'cancelled'
  if (base === 'draft') return 'draft'
  if (payment === 'paid') return 'paid'
  if (payment === 'partially_paid') return 'partially_paid'
  if (payment === 'overdue') return 'overdue'
  if (base === 'sent') return 'sent'
  return 'finalized'
}

/** Parse a client-facing quote such as "USD 1,850" or "USD 2,850 per person". */
export function parseClientFacingPrice(raw: string | null | undefined): { currency: string; amount: number } {
  if (!raw) return { currency: 'USD', amount: 0 }
  const currencyMatch = raw.match(/\b([A-Z]{3})\b/)
  const currency = currencyMatch?.[1] || 'USD'
  const cleaned = raw.replace(/[^0-9.]/g, '')
  const parsed = Number(cleaned)
  if (!Number.isFinite(parsed) || parsed < 0) return { currency, amount: 0 }
  return { currency, amount: Number(parsed.toFixed(2)) }
}

export function uniqueInOrder(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of values) {
    const next = (value || '').trim()
    if (!next) continue
    const key = next.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(next)
  }
  return out
}

export const VEHICLE_ID_ALIASES: Record<string, string> = {
  highroof: 'kdh-high',
  'high-roof': 'kdh-high',
  'kdh high roof': 'kdh-high',
  'toyota kdh high roof': 'kdh-high',
  flatroof: 'kdh-standard',
  'flat-roof': 'kdh-standard',
  'kdh standard': 'kdh-standard',
  'toyota kdh standard roof': 'kdh-standard',
}

export function normalizeVehicleLookup(value: string | null | undefined): string {
  if (!value) return ''
  return value.trim().toLowerCase()
}
