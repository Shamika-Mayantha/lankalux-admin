import { AppError, getServiceClient, isMissingTableError } from '@/services/supabase.server'
import { normalizeStatus, type RequestStatus } from '@/config/status'
import { BASE_CURRENCY, EXPENSE_CATEGORIES, FINANCE_CURRENCIES, type ExpenseCategory } from '@/config/finance'

const WON: RequestStatus[] = ['sold', 'after_sales']
const TREND_MONTHS = 12
const COLOMBO_OFFSET_MS = 5.5 * 60 * 60 * 1000

export type TripFinance = {
  request_id: string
  sold_on: string
  sale_amount: number
  sale_currency: string
  sale_rate: number
  cost_hotels: number
  cost_transport: number
  cost_activities: number
  cost_other: number
  cost_currency: string
  cost_rate: number
  note: string
  updated_by: string | null
  updated_at: string
}

export type TripRow = {
  request_id: string
  client_name: string | null
  start_date: string | null
  end_date: string | null
  sold_price: string | null
  /** Saved money record, or null while nobody has entered the numbers yet. */
  finance: TripFinance | null
  /** Month the trip counts in: the saved sold_on, else the day it was marked Sold. */
  sold_on: string
  income: number
  costs: number
  profit: number
  margin: number | null
}

export type ExpenseRow = {
  id: string
  month: string
  category: ExpenseCategory
  label: string
  amount: number
  currency: string
  rate: number
  note: string
  created_by: string | null
  created_at: string
  base_amount: number
}

export type MonthTotals = {
  month: string
  income: number
  trip_costs: number
  gross_profit: number
  expenses: Record<ExpenseCategory, number>
  expenses_total: number
  net_profit: number
  trips: number
}

export type FinanceReport = {
  base_currency: string
  month: string
  ready: boolean
  totals: MonthTotals
  trips: TripRow[]
  /** Sold requests from any month that still have no numbers entered. */
  missing: TripRow[]
  expenses: ExpenseRow[]
  trend: MonthTotals[]
  last_rates: Record<string, number>
  /** The trip asked for with ?trip=, from any month. */
  focus: TripRow | null
}

const round = (n: number) => Math.round(n * 100) / 100
const num = (v: unknown) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function colomboToday(now = new Date()): string {
  return new Date(now.getTime() + COLOMBO_OFFSET_MS).toISOString().slice(0, 10)
}

export function monthKey(value: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})/.exec(value || '')
  return m ? `${m[1]}-${m[2]}` : colomboToday().slice(0, 7)
}

function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + by, 1))
  return d.toISOString().slice(0, 7)
}

export function tripIncome(f: TripFinance): number {
  return num(f.sale_amount) * (f.sale_currency === BASE_CURRENCY ? 1 : num(f.sale_rate))
}

export function tripCosts(f: TripFinance): number {
  const sum = num(f.cost_hotels) + num(f.cost_transport) + num(f.cost_activities) + num(f.cost_other)
  return sum * (f.cost_currency === BASE_CURRENCY ? 1 : num(f.cost_rate))
}

function expenseBase(e: { amount: unknown; currency: string; rate: unknown }): number {
  return num(e.amount) * (e.currency === BASE_CURRENCY ? 1 : num(e.rate))
}

function emptyTotals(month: string): MonthTotals {
  return {
    month,
    income: 0,
    trip_costs: 0,
    gross_profit: 0,
    expenses: { ad_spend: 0, salary: 0, software: 0, office: 0, other: 0 },
    expenses_total: 0,
    net_profit: 0,
    trips: 0,
  }
}

function finish(t: MonthTotals): MonthTotals {
  const expenses = Object.fromEntries(Object.entries(t.expenses).map(([k, v]) => [k, round(v)])) as MonthTotals['expenses']
  const expensesTotal = Object.values(expenses).reduce((a, b) => a + b, 0)
  return {
    ...t,
    income: round(t.income),
    trip_costs: round(t.trip_costs),
    gross_profit: round(t.income - t.trip_costs),
    expenses,
    expenses_total: round(expensesTotal),
    net_profit: round(t.income - t.trip_costs - expensesTotal),
  }
}

type RequestLite = {
  id: string
  client_name: string | null
  start_date: string | null
  end_date: string | null
  status: string | null
  sold_price: string | null
  updated_at: string | null
}

export async function buildFinanceReport(month: string, focusId: string | null = null, now = new Date()): Promise<FinanceReport> {
  const sb = getServiceClient()
  const trendFrom = shiftMonth(month, -(TREND_MONTHS - 1))
  const trendTo = shiftMonth(month, 1)

  const [requestsRes, financeRes, expensesRes, soldLogRes] = await Promise.all([
    sb.from('Client Requests').select('id, client_name, start_date, end_date, status, sold_price, updated_at').limit(10000),
    sb.from('request_finance').select('*').limit(10000),
    sb
      .from('finance_expenses')
      .select('*')
      .gte('month', `${trendFrom}-01`)
      .lt('month', `${trendTo}-01`)
      .order('created_at', { ascending: true })
      .limit(10000),
    sb
      .from('activity_logs')
      .select('request_id, created_at')
      .eq('event_type', 'status_changed')
      .eq('detail->>to', 'sold')
      .limit(10000),
  ])
  if (requestsRes.error) throw new AppError(`Supabase request failed: ${requestsRes.error.message}`, 500)
  if (soldLogRes.error) throw new AppError(`Supabase request failed: ${soldLogRes.error.message}`, 500)
  // Before the finance migration has run, show an empty page with a note instead of an error.
  const ready = !(financeRes.error && isMissingTableError(financeRes.error)) && !(expensesRes.error && isMissingTableError(expensesRes.error))
  for (const res of [financeRes, expensesRes]) {
    if (res.error && !isMissingTableError(res.error)) throw new AppError(`Supabase request failed: ${res.error.message}`, 500)
  }

  const soldAt = new Map<string, string>()
  for (const ev of (soldLogRes.data || []) as { request_id: string; created_at: string }[]) {
    const prev = soldAt.get(ev.request_id)
    if (!prev || ev.created_at > prev) soldAt.set(ev.request_id, ev.created_at)
  }
  const finance = new Map(((financeRes.data || []) as TripFinance[]).map((f) => [f.request_id, f]))

  const trips: TripRow[] = []
  for (const r of (requestsRes.data || []) as RequestLite[]) {
    const won = WON.includes(normalizeStatus(r.status) || 'new')
    const f = finance.get(r.id) || null
    // A trip with saved numbers stays on the books even if its status later changes.
    if (!won && !f) continue
    const markedSold = soldAt.get(r.id)
    const soldOn = f?.sold_on || (markedSold ? colomboToday(new Date(markedSold)) : (r.updated_at || '').slice(0, 10) || colomboToday(now))
    const income = f ? tripIncome(f) : 0
    const costs = f ? tripCosts(f) : 0
    trips.push({
      request_id: r.id,
      client_name: r.client_name,
      start_date: r.start_date,
      end_date: r.end_date,
      sold_price: r.sold_price,
      finance: f,
      sold_on: soldOn,
      income: round(income),
      costs: round(costs),
      profit: round(income - costs),
      margin: income > 0 ? (income - costs) / income : null,
    })
  }
  trips.sort((a, b) => b.sold_on.localeCompare(a.sold_on))

  const expenses: ExpenseRow[] = ((expensesRes.data || []) as Omit<ExpenseRow, 'base_amount'>[]).map((e) => ({
    ...e,
    month: e.month.slice(0, 7),
    amount: num(e.amount),
    rate: num(e.rate),
    base_amount: round(expenseBase(e)),
  }))

  const byMonth = new Map<string, MonthTotals>()
  for (let i = 0; i < TREND_MONTHS; i++) {
    const m = shiftMonth(trendFrom, i)
    byMonth.set(m, emptyTotals(m))
  }
  for (const t of trips) {
    const bucket = byMonth.get(monthKey(t.sold_on))
    if (!bucket || !t.finance) continue
    bucket.income += t.income
    bucket.trip_costs += t.costs
    bucket.trips += 1
  }
  for (const e of expenses) {
    const bucket = byMonth.get(e.month)
    if (bucket) bucket.expenses[e.category] += e.base_amount
  }
  const trend = [...byMonth.values()].map(finish)

  // Most recent rate used per currency, to pre-fill the next entry.
  const lastRates: Record<string, number> = {}
  const rated: { at: string; currency: string; rate: number }[] = []
  for (const f of finance.values()) {
    rated.push({ at: f.updated_at, currency: f.sale_currency, rate: num(f.sale_rate) })
    rated.push({ at: f.updated_at, currency: f.cost_currency, rate: num(f.cost_rate) })
  }
  for (const e of expenses) rated.push({ at: e.created_at, currency: e.currency, rate: e.rate })
  rated.sort((a, b) => a.at.localeCompare(b.at))
  for (const r of rated) if (r.currency !== BASE_CURRENCY && r.rate > 0) lastRates[r.currency] = r.rate

  return {
    base_currency: BASE_CURRENCY,
    month,
    ready,
    totals: trend.find((t) => t.month === month) || finish(emptyTotals(month)),
    trips: trips.filter((t) => monthKey(t.sold_on) === month),
    missing: trips.filter((t) => !t.finance),
    expenses: expenses.filter((e) => e.month === month),
    trend,
    last_rates: lastRates,
    focus: (focusId && trips.find((t) => t.request_id === focusId)) || null,
  }
}

function money(value: unknown, field: string): number {
  const n = Number(value ?? 0)
  if (!Number.isFinite(n) || n < 0) throw new AppError(`${field} must be a positive number.`, 400)
  return round(n)
}

function currency(value: unknown, field: string): string {
  const c = String(value || '').toUpperCase()
  if (!(FINANCE_CURRENCIES as readonly string[]).includes(c)) throw new AppError(`${field} currency is not supported.`, 400)
  return c
}

function fxRate(value: unknown, cur: string, field: string): number {
  if (cur === BASE_CURRENCY) return 1
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) throw new AppError(`Enter the ${cur} to ${BASE_CURRENCY} rate for ${field}.`, 400)
  return Math.round(n * 10000) / 10000
}

function isoDay(value: unknown): string {
  const s = String(value || '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new AppError('Sold date must be YYYY-MM-DD.', 400)
  return s
}

export async function saveTripFinance(requestId: string, body: Record<string, unknown>, by: string | undefined) {
  const sb = getServiceClient()
  const { data: req, error: reqErr } = await sb.from('Client Requests').select('id').eq('id', requestId).maybeSingle()
  if (reqErr) throw new AppError(`Supabase request failed: ${reqErr.message}`, 500)
  if (!req) throw new AppError('Request not found.', 404)
  const saleCurrency = currency(body.sale_currency, 'Sale')
  const costCurrency = currency(body.cost_currency, 'Cost')
  const row = {
    request_id: requestId,
    sold_on: isoDay(body.sold_on),
    sale_amount: money(body.sale_amount, 'Sale price'),
    sale_currency: saleCurrency,
    sale_rate: fxRate(body.sale_rate, saleCurrency, 'the sale'),
    cost_hotels: money(body.cost_hotels, 'Hotels'),
    cost_transport: money(body.cost_transport, 'Transport'),
    cost_activities: money(body.cost_activities, 'Activities'),
    cost_other: money(body.cost_other, 'Other costs'),
    cost_currency: costCurrency,
    cost_rate: fxRate(body.cost_rate, costCurrency, 'the costs'),
    note: String(body.note || '').slice(0, 2000),
    updated_by: by || null,
    updated_at: new Date().toISOString(),
  }
  const { error } = await sb.from('request_finance').upsert(row, { onConflict: 'request_id' })
  if (error) throw new AppError(`Could not save: ${error.message}`, 500)
}

export async function addExpense(body: Record<string, unknown>, by: string | undefined) {
  const category = String(body.category || '') as ExpenseCategory
  if (!EXPENSE_CATEGORIES.includes(category)) throw new AppError('Pick an expense type.', 400)
  const cur = currency(body.currency, 'Expense')
  const row = {
    month: `${monthKey(String(body.month || ''))}-01`,
    category,
    label: String(body.label || '').trim().slice(0, 200),
    amount: money(body.amount, 'Amount'),
    currency: cur,
    rate: fxRate(body.rate, cur, 'this expense'),
    note: String(body.note || '').slice(0, 2000),
    created_by: by || null,
  }
  if (!row.amount) throw new AppError('Enter an amount.', 400)
  const { error } = await getServiceClient().from('finance_expenses').insert(row)
  if (error) throw new AppError(`Could not save: ${error.message}`, 500)
}

export async function deleteExpense(id: string) {
  const { error } = await getServiceClient().from('finance_expenses').delete().eq('id', id)
  if (error) throw new AppError(`Could not delete: ${error.message}`, 500)
}

/** Copies last month's salary lines into `month`, skipping names already entered there. */
export async function copySalaries(month: string, by: string | undefined): Promise<number> {
  const sb = getServiceClient()
  const prev = shiftMonth(month, -1)
  const [prevRes, nowRes] = await Promise.all([
    sb.from('finance_expenses').select('label, amount, currency, rate, note').eq('category', 'salary').eq('month', `${prev}-01`),
    sb.from('finance_expenses').select('label').eq('category', 'salary').eq('month', `${month}-01`),
  ])
  if (prevRes.error) throw new AppError(`Supabase request failed: ${prevRes.error.message}`, 500)
  if (nowRes.error) throw new AppError(`Supabase request failed: ${nowRes.error.message}`, 500)
  const have = new Set((nowRes.data || []).map((r) => (r.label || '').trim().toLowerCase()))
  const rows = (prevRes.data || [])
    .filter((r) => !have.has((r.label || '').trim().toLowerCase()))
    .map((r) => ({ ...r, month: `${month}-01`, category: 'salary', created_by: by || null }))
  if (!rows.length) return 0
  const { error } = await sb.from('finance_expenses').insert(rows)
  if (error) throw new AppError(`Could not copy: ${error.message}`, 500)
  return rows.length
}
