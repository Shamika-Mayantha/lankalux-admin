import { AppError, getServiceClient } from '@/services/supabase.server'
import { normalizeStatus, type RequestStatus } from '@/config/status'

export const PERFORMANCE_RANGES = ['week', 'month', 'quarter', 'year'] as const
export type PerformanceRange = (typeof PERFORMANCE_RANGES)[number]

export type Money = { currency: string; amount: number }

export type AgentWorkload = {
  user_id: string | null
  name: string
  email: string | null
  role: string | null
  open: number
  enquiries: number
  sold: number
  revenue: Money[]
  conversion: number | null
}

export type PerformanceReport = {
  range: PerformanceRange
  from: string
  previous_from: string
  enquiries: { current: number; previous: number }
  sold: { current: number; previous: number }
  conversion: { current: number | null; previous: number | null; all_time: number | null }
  revenue: { current: Money[]; previous: Money[] }
  open: number
  unassigned_open: number
  weekly: { week_start: string; enquiries: number; sold: number }[]
  agents: AgentWorkload[]
}

type RequestRow = {
  id: string
  status: string | null
  created_at: string
  created_by: string | null
  assigned_agent_id: string | null
}

const OPEN: RequestStatus[] = ['new', 'follow_up']
const WON: RequestStatus[] = ['sold', 'after_sales']
// Sri Lanka has no daylight saving, so a fixed offset gives local calendar boundaries.
const COLOMBO_OFFSET_MS = 5.5 * 60 * 60 * 1000
const TREND_WEEKS = 12

/** Start of the Colombo-local day/week/month/quarter/year containing `now`, as a UTC instant. */
function periodStart(range: PerformanceRange, now: Date, back = 0): Date {
  const local = new Date(now.getTime() + COLOMBO_OFFSET_MS)
  let y = local.getUTCFullYear()
  let m = local.getUTCMonth()
  let d = local.getUTCDate()
  if (range === 'week') {
    d -= (local.getUTCDay() + 6) % 7 // Monday
    d -= 7 * back
  } else if (range === 'month') {
    d = 1
    m -= back
  } else if (range === 'quarter') {
    d = 1
    m = m - (m % 3) - 3 * back
  } else {
    d = 1
    m = 0
    y -= back
  }
  return new Date(Date.UTC(y, m, d) - COLOMBO_OFFSET_MS)
}

function colomboDate(instant: Date): string {
  return new Date(instant.getTime() + COLOMBO_OFFSET_MS).toISOString().slice(0, 10)
}

function between(iso: string | null | undefined, from: Date, to: Date): boolean {
  if (!iso) return false
  const t = new Date(iso).getTime()
  return !Number.isNaN(t) && t >= from.getTime() && t < to.getTime()
}

function addMoney(totals: Map<string, number>, currency: string | null, amount: unknown) {
  const n = Number(amount)
  if (!Number.isFinite(n)) return
  const c = (currency || 'USD').toUpperCase()
  totals.set(c, (totals.get(c) || 0) + n)
}

function moneyList(totals: Map<string, number>): Money[] {
  return [...totals.entries()]
    .map(([currency, amount]) => ({ currency, amount: Math.round(amount * 100) / 100 }))
    .sort((a, b) => b.amount - a.amount)
}

function rate(won: number, total: number): number | null {
  return total > 0 ? won / total : null
}

/** The agent a request belongs to: whoever it is assigned to, else whoever created it. */
function ownerOf(r: RequestRow): string | null {
  return r.assigned_agent_id || r.created_by || null
}

export async function buildPerformanceReport(range: PerformanceRange, now = new Date()): Promise<PerformanceReport> {
  const sb = getServiceClient()
  const from = periodStart(range, now)
  const prevFrom = periodStart(range, now, 1)
  const trendFrom = periodStart('week', now, TREND_WEEKS - 1)
  const earliest = new Date(Math.min(prevFrom.getTime(), trendFrom.getTime()))

  const [requestsRes, salesRes, paymentsRes, staffRes] = await Promise.all([
    sb.from('Client Requests').select('id, status, created_at, created_by, assigned_agent_id').limit(10000),
    sb
      .from('activity_logs')
      .select('request_id, created_at')
      .eq('event_type', 'status_changed')
      .eq('detail->>to', 'sold')
      .gte('created_at', earliest.toISOString())
      .limit(10000),
    sb
      .from('invoice_payments')
      .select('invoice_id, amount, currency, payment_date, status')
      .gte('payment_date', colomboDate(prevFrom))
      .limit(10000),
    sb.from('admin_users').select('user_id, email, full_name, role, active'),
  ])
  for (const res of [requestsRes, salesRes, paymentsRes]) {
    if (res.error) throw new AppError(`Supabase request failed: ${res.error.message}`, 500)
  }

  const requests = (requestsRes.data || []) as RequestRow[]
  const byId = new Map(requests.map((r) => [r.id, r]))
  const statusOf = (r: RequestRow) => normalizeStatus(r.status) || 'new'

  // A sale counts on the day it was last marked Sold, and only if it is still won (not later cancelled).
  const soldAt = new Map<string, string>()
  for (const ev of (salesRes.data || []) as { request_id: string; created_at: string }[]) {
    const r = byId.get(ev.request_id)
    if (!r || !WON.includes(statusOf(r))) continue
    const prev = soldAt.get(ev.request_id)
    if (!prev || ev.created_at > prev) soldAt.set(ev.request_id, ev.created_at)
  }

  // Payments: map invoice -> request so revenue can be credited to the request's agent.
  const payments = ((paymentsRes.data || []) as {
    invoice_id: string
    amount: number
    currency: string | null
    payment_date: string
    status: string | null
  }[]).filter((p) => !p.status || p.status === 'successful')
  const invoiceIds = [...new Set(payments.map((p) => p.invoice_id))]
  const invoiceRequest = new Map<string, string>()
  if (invoiceIds.length) {
    const { data, error } = await sb.from('invoices').select('id, request_id').in('id', invoiceIds)
    if (error) throw new AppError(`Supabase request failed: ${error.message}`, 500)
    for (const inv of (data || []) as { id: string; request_id: string }[]) invoiceRequest.set(inv.id, inv.request_id)
  }

  const fromDay = colomboDate(from)
  const prevFromDay = colomboDate(prevFrom)
  const revenueNow = new Map<string, number>()
  const revenuePrev = new Map<string, number>()
  const revenueByAgent = new Map<string, Map<string, number>>()
  for (const p of payments) {
    if (p.payment_date >= fromDay) {
      addMoney(revenueNow, p.currency, p.amount)
      const req = byId.get(invoiceRequest.get(p.invoice_id) || '')
      const owner = (req && ownerOf(req)) || ''
      if (!revenueByAgent.has(owner)) revenueByAgent.set(owner, new Map())
      addMoney(revenueByAgent.get(owner)!, p.currency, p.amount)
    } else if (p.payment_date >= prevFromDay) {
      addMoney(revenuePrev, p.currency, p.amount)
    }
  }

  const created = (a: Date, b: Date) => requests.filter((r) => between(r.created_at, a, b))
  const soldIn = (a: Date, b: Date) => [...soldAt.entries()].filter(([, at]) => between(at, a, b)).map(([id]) => id)
  const enquiriesNow = created(from, now)
  const enquiriesPrev = created(prevFrom, from)
  const wonCount = (rows: RequestRow[]) => rows.filter((r) => WON.includes(statusOf(r))).length
  // All-time conversion ignores enquiries still being worked, so it is not dragged down by fresh leads.
  const decided = requests.filter((r) => !OPEN.includes(statusOf(r)))

  const weekly: PerformanceReport['weekly'] = []
  for (let i = TREND_WEEKS - 1; i >= 0; i--) {
    const a = periodStart('week', now, i)
    const b = i === 0 ? now : periodStart('week', now, i - 1)
    weekly.push({ week_start: colomboDate(a), enquiries: created(a, b).length, sold: soldIn(a, b).length })
  }

  const soldNowIds = new Set(soldIn(from, now))
  const staff = ((staffRes.error ? [] : staffRes.data) || []) as {
    user_id: string
    email: string | null
    full_name: string | null
    role: string | null
    active: boolean
  }[]
  const agents: AgentWorkload[] = []
  const known = new Set(staff.map((s) => s.user_id))
  const workload = (owns: (r: RequestRow) => boolean, revenueKeys: string[]) => {
    const mine = requests.filter(owns)
    const mineDecided = mine.filter((r) => !OPEN.includes(statusOf(r)))
    const revenue = new Map<string, number>()
    for (const key of revenueKeys) for (const [c, n] of revenueByAgent.get(key) || []) addMoney(revenue, c, n)
    return {
      open: mine.filter((r) => OPEN.includes(statusOf(r))).length,
      enquiries: mine.filter((r) => between(r.created_at, from, now)).length,
      sold: mine.filter((r) => soldNowIds.has(r.id)).length,
      revenue: moneyList(revenue),
      conversion: rate(wonCount(mineDecided), mineDecided.length),
    }
  }
  for (const s of staff) {
    const w = workload((r) => ownerOf(r) === s.user_id, [s.user_id])
    // Hide deactivated logins unless they still own live work.
    if (!s.active && w.open === 0 && w.enquiries === 0 && w.sold === 0) continue
    const name = s.full_name || s.email || 'Staff'
    agents.push({ user_id: s.user_id, name: s.active ? name : `${name} (inactive)`, email: s.email, role: s.role, ...w })
  }
  // Older requests predate staff logins, so they have no owner (or one who is no longer staff).
  const isUnowned = (owner: string | null) => !owner || !known.has(owner)
  const unownedKeys = [...revenueByAgent.keys()].filter((k) => isUnowned(k || null))
  const unowned = workload((r) => isUnowned(ownerOf(r)), unownedKeys)
  if (unowned.open || unowned.enquiries || unowned.sold || unowned.revenue.length) {
    agents.push({ user_id: null, name: 'Not assigned', email: null, role: null, ...unowned })
  }
  agents.sort((a, b) => b.open - a.open || b.enquiries - a.enquiries)

  return {
    range,
    from: from.toISOString(),
    previous_from: prevFrom.toISOString(),
    enquiries: { current: enquiriesNow.length, previous: enquiriesPrev.length },
    sold: { current: soldNowIds.size, previous: soldIn(prevFrom, from).length },
    conversion: {
      current: rate(wonCount(enquiriesNow), enquiriesNow.length),
      previous: rate(wonCount(enquiriesPrev), enquiriesPrev.length),
      all_time: rate(wonCount(decided), decided.length),
    },
    revenue: { current: moneyList(revenueNow), previous: moneyList(revenuePrev) },
    open: requests.filter((r) => OPEN.includes(statusOf(r))).length,
    unassigned_open: requests.filter((r) => OPEN.includes(statusOf(r)) && !r.assigned_agent_id).length,
    weekly,
    agents,
  }
}
