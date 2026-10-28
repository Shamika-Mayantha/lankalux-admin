'use client'

import Link from 'next/link'
import { Suspense, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { consoleFetch, useConsoleGet } from '@/lib/console-api'
import { formatDay } from '@/lib/format'
import { SkeletonRows } from '@/components/ui/RowLink'
import { parseClientFacingPrice } from '@/services/invoice-math'
import {
  BASE_CURRENCY,
  EXPENSE_CATEGORIES,
  EXPENSE_LABEL,
  FINANCE_CURRENCIES,
  type ExpenseCategory,
} from '@/config/finance'
import type { ExpenseRow, FinanceReport, MonthTotals, TripRow } from '@/services/finance.service'

const COLOMBO_OFFSET_MS = 5.5 * 60 * 60 * 1000

function thisMonth() {
  return new Date(Date.now() + COLOMBO_OFFSET_MS).toISOString().slice(0, 7)
}

function shiftMonth(month: string, by: number) {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1 + by, 1)).toISOString().slice(0, 7)
}

function monthLabel(month: string, short = false) {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-GB', {
    month: short ? 'short' : 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function fmt(amount: number, currency = BASE_CURRENCY) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount || 0)
}

function pct(value: number | null) {
  return value == null ? '—' : `${Math.round(value * 100)}%`
}

const num = (v: string) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

export default function FinancePage() {
  return (
    <Suspense fallback={null}>
      <Finance />
    </Suspense>
  )
}

function Finance() {
  const [month, setMonth] = useState(thisMonth)
  // Opened from a request's "Sale & costs" button: jump to that trip's month and open it.
  const asked = useSearchParams().get('trip')
  const [opened, setOpened] = useState<string | null>(null)
  const focusQuery = asked && opened !== asked ? `&trip=${encodeURIComponent(asked)}` : ''
  const { data, error, loading, reload } = useConsoleGet<{ report?: FinanceReport }>(`/api/v2/finance?month=${month}${focusQuery}`)
  const r = data?.report
  const busy = loading && !r
  const [editing, setEditing] = useState<TripRow | null>(null)
  if (asked && opened !== asked && r?.focus?.request_id === asked) {
    setOpened(asked)
    setMonth(r.focus.sold_on.slice(0, 7))
    setEditing(r.focus)
  }

  return (
    <div>
      <h1 className="ll-h1">Profit &amp; expenses</h1>
      <p className="ll-sub">
        What each sold trip earned, what the business spent, and what is left. All totals in {BASE_CURRENCY}.
      </p>
      {error && <div className="ll-error">{error}</div>}
      {r && !r.ready && (
        <div className="ll-error">The finance tables are not set up in the database yet, so nothing can be saved.</div>
      )}

      <div className="ll-row ll-fin-month">
        <button className="ll-btn secondary" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month">
          ‹
        </button>
        <strong>{monthLabel(month)}</strong>
        <button
          className="ll-btn secondary"
          onClick={() => setMonth(shiftMonth(month, 1))}
          disabled={month >= thisMonth()}
          aria-label="Next month"
        >
          ›
        </button>
        {month !== thisMonth() && (
          <button className="ll-btn ghost" onClick={() => setMonth(thisMonth())}>
            This month
          </button>
        )}
      </div>

      <Totals totals={r?.totals} busy={busy} />

      {r && r.missing.length > 0 && (
        <div className="ll-card ll-fin-missing">
          <h3>
            {r.missing.length} sold {r.missing.length === 1 ? 'trip needs' : 'trips need'} numbers
          </h3>
          <p className="ll-muted">Enter the sale price and trip costs so they count towards profit.</p>
          <div className="ll-row">
            {r.missing.map((t) => (
              <button key={t.request_id} className="ll-btn secondary" onClick={() => setEditing(t)}>
                {t.client_name || t.request_id} · sold {formatDay(t.sold_on)}
              </button>
            ))}
          </div>
        </div>
      )}

      <section className="ll-category">
        <div className="ll-category-head">
          <h2>Sold trips</h2>
          <span className="ll-muted">Counted in the month they were sold.</span>
        </div>
        <TripsTable trips={r?.trips || []} busy={busy} onEdit={setEditing} />
      </section>

      <section className="ll-category">
        <div className="ll-category-head">
          <h2>Expenses</h2>
          <span className="ll-muted">Ad spend, salaries and running costs for {monthLabel(month)}.</span>
        </div>
        <Expenses month={month} rows={r?.expenses || []} busy={busy} lastRates={r?.last_rates || {}} onChange={reload} />
      </section>

      <section className="ll-category">
        <div className="ll-category-head">
          <h2>Last 12 months</h2>
        </div>
        <Trend months={r?.trend || []} onPick={setMonth} current={month} />
      </section>

      {editing && r && (
        <TripEditor
          trip={editing}
          lastRates={r.last_rates}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            reload()
          }}
        />
      )}
    </div>
  )
}

function Totals({ totals, busy }: { totals?: MonthTotals; busy: boolean }) {
  const cards: { label: string; value?: number; hint?: string; strong?: boolean }[] = [
    { label: 'Income', value: totals?.income, hint: totals ? `${totals.trips} sold ${totals.trips === 1 ? 'trip' : 'trips'}` : '' },
    { label: 'Trip costs', value: totals?.trip_costs, hint: 'Hotels, transport, activities' },
    { label: 'Gross profit', value: totals?.gross_profit, hint: totals && totals.income > 0 ? `${pct(totals.gross_profit / totals.income)} margin` : '' },
    {
      label: 'Expenses',
      value: totals?.expenses_total,
      hint: totals ? `Ads ${fmt(totals.expenses.ad_spend)} · Salaries ${fmt(totals.expenses.salary)}` : '',
    },
    { label: 'Net profit', value: totals?.net_profit, hint: 'Gross profit minus expenses', strong: true },
  ]
  return (
    <div className="ll-grid ll-fin-totals">
      {cards.map((c) => (
        <div key={c.label} className={`ll-card${c.strong ? ' ll-fin-net' : ''}`}>
          <h3>{c.label}</h3>
          <p className={`ll-stat ll-fin-amount${c.value != null && c.value < 0 ? ' ll-fin-loss' : ''}`}>
            {busy ? (
              <span className="ll-skel ll-skel-stat" />
            ) : (
              <>
                <span className="ll-fin-cur">{BASE_CURRENCY}</span>
                {Math.round(c.value || 0).toLocaleString('en-GB')}
              </>
            )}
          </p>
          {c.hint && <span className="ll-muted ll-perf-change">{c.hint}</span>}
        </div>
      ))}
    </div>
  )
}

function TripsTable({ trips, busy, onEdit }: { trips: TripRow[]; busy: boolean; onEdit: (t: TripRow) => void }) {
  return (
    <div className="ll-table-wrap">
      <table className="ll-table">
        <thead>
          <tr>
            <th>Client</th>
            <th>Sold</th>
            <th>Sale</th>
            <th>Costs</th>
            <th>Profit</th>
            <th>Margin</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {busy ? (
            <SkeletonRows cols={7} />
          ) : trips.length === 0 ? (
            <tr>
              <td colSpan={7} className="ll-muted">
                No trips sold this month.
              </td>
            </tr>
          ) : (
            trips.map((t) => (
              <tr key={t.request_id}>
                <td>
                  <Link href={`/console/requests/${t.request_id}`}>{t.client_name || t.request_id}</Link>
                </td>
                <td>{formatDay(t.sold_on)}</td>
                <td>
                  {t.finance ? (
                    <>
                      {fmt(t.income)}
                      {t.finance.sale_currency !== BASE_CURRENCY && (
                        <span className="ll-muted"> · {fmt(t.finance.sale_amount, t.finance.sale_currency)}</span>
                      )}
                    </>
                  ) : (
                    <span className="ll-muted">{t.sold_price || 'Not entered'}</span>
                  )}
                </td>
                <td>{t.finance ? fmt(t.costs) : '—'}</td>
                <td className={t.profit < 0 ? 'll-fin-loss' : ''}>{t.finance ? fmt(t.profit) : '—'}</td>
                <td>{t.finance ? pct(t.margin) : '—'}</td>
                <td>
                  <button className="ll-btn secondary" onClick={() => onEdit(t)}>
                    {t.finance ? 'Edit' : 'Enter numbers'}
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

function CurrencyPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {FINANCE_CURRENCIES.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
    </select>
  )
}

function TripEditor({
  trip,
  lastRates,
  onClose,
  onSaved,
}: {
  trip: TripRow
  lastRates: Record<string, number>
  onClose: () => void
  onSaved: () => void
}) {
  const f = trip.finance
  const quoted = parseClientFacingPrice(trip.sold_price)
  const startCurrency = f?.sale_currency || ((FINANCE_CURRENCIES as readonly string[]).includes(quoted.currency) ? quoted.currency : 'USD')
  const rateFor = (c: string, saved?: number) => (c === BASE_CURRENCY ? '1' : String(saved || lastRates[c] || ''))
  const [form, setForm] = useState({
    sold_on: f?.sold_on || trip.sold_on,
    sale_amount: String(f?.sale_amount ?? (quoted.amount || '')),
    sale_currency: startCurrency,
    sale_rate: rateFor(startCurrency, f?.sale_currency === startCurrency ? f?.sale_rate : undefined),
    cost_hotels: String(f?.cost_hotels ?? ''),
    cost_transport: String(f?.cost_transport ?? ''),
    cost_activities: String(f?.cost_activities ?? ''),
    cost_other: String(f?.cost_other ?? ''),
    cost_currency: f?.cost_currency || BASE_CURRENCY,
    cost_rate: rateFor(f?.cost_currency || BASE_CURRENCY, f?.cost_rate),
    note: f?.note || '',
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const set = (k: keyof typeof form, v: string) => setForm((p) => ({ ...p, [k]: v }))

  const preview = useMemo(() => {
    const income = num(form.sale_amount) * (form.sale_currency === BASE_CURRENCY ? 1 : num(form.sale_rate))
    const costs =
      (num(form.cost_hotels) + num(form.cost_transport) + num(form.cost_activities) + num(form.cost_other)) *
      (form.cost_currency === BASE_CURRENCY ? 1 : num(form.cost_rate))
    return { income, costs, profit: income - costs, margin: income > 0 ? (income - costs) / income : null }
  }, [form])

  async function save() {
    setSaving(true)
    setErr('')
    try {
      await consoleFetch(`/api/v2/finance/trips/${encodeURIComponent(trip.request_id)}`, {
        method: 'PUT',
        body: JSON.stringify(form),
      })
      onSaved()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save.')
      setSaving(false)
    }
  }

  const costField = (k: 'cost_hotels' | 'cost_transport' | 'cost_activities' | 'cost_other', label: string) => (
    <label>
      {label}
      <input inputMode="decimal" value={form[k]} onChange={(e) => set(k, e.target.value)} placeholder="0" />
    </label>
  )

  return (
    <div className="ll-modal-back" onClick={onClose}>
      <div className="ll-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Trip money">
        <h2 style={{ marginTop: 0 }}>{trip.client_name || trip.request_id}</h2>
        <p className="ll-muted">
          {trip.sold_price ? `Quoted on the request: ${trip.sold_price}. ` : ''}Profit fills in as you type.
        </p>
        <div className="ll-form">
          <div className="ll-fin-fields">
            <label>
              Guest paid
              <input inputMode="decimal" value={form.sale_amount} onChange={(e) => set('sale_amount', e.target.value)} />
            </label>
            <label>
              Currency
              <CurrencyPicker
                value={form.sale_currency}
                onChange={(c) => setForm((p) => ({ ...p, sale_currency: c, sale_rate: rateFor(c) }))}
              />
            </label>
            {form.sale_currency !== BASE_CURRENCY && (
              <label>
                1 {form.sale_currency} = ? {BASE_CURRENCY}
                <input inputMode="decimal" value={form.sale_rate} onChange={(e) => set('sale_rate', e.target.value)} />
              </label>
            )}
            <label>
              Sold on
              <input type="date" value={form.sold_on} onChange={(e) => set('sold_on', e.target.value)} />
            </label>
          </div>
          <h3 className="ll-fin-subhead">Trip costs</h3>
          <div className="ll-fin-fields">
            {costField('cost_hotels', 'Hotels')}
            {costField('cost_transport', 'Driver & transport')}
            {costField('cost_activities', 'Activities & tickets')}
            {costField('cost_other', 'Other')}
            <label>
              Costs paid in
              <CurrencyPicker
                value={form.cost_currency}
                onChange={(c) => setForm((p) => ({ ...p, cost_currency: c, cost_rate: rateFor(c) }))}
              />
            </label>
            {form.cost_currency !== BASE_CURRENCY && (
              <label>
                1 {form.cost_currency} = ? {BASE_CURRENCY}
                <input inputMode="decimal" value={form.cost_rate} onChange={(e) => set('cost_rate', e.target.value)} />
              </label>
            )}
          </div>
          <label>
            Note
            <textarea rows={2} value={form.note} onChange={(e) => set('note', e.target.value)} />
          </label>
          <div className="ll-fin-preview">
            <span>
              Income <strong>{fmt(preview.income)}</strong>
            </span>
            <span>
              Costs <strong>{fmt(preview.costs)}</strong>
            </span>
            <span>
              Profit <strong className={preview.profit < 0 ? 'll-fin-loss' : ''}>{fmt(preview.profit)}</strong>
            </span>
            <span>
              Margin <strong>{pct(preview.margin)}</strong>
            </span>
          </div>
          {err && <div className="ll-error">{err}</div>}
          <div className="ll-row">
            <button className="ll-btn" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button className="ll-btn ghost" onClick={onClose}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Expenses({
  month,
  rows,
  busy,
  lastRates,
  onChange,
}: {
  month: string
  rows: ExpenseRow[]
  busy: boolean
  lastRates: Record<string, number>
  onChange: () => void
}) {
  const blank = {
    category: 'ad_spend' as ExpenseCategory,
    label: '',
    amount: '',
    currency: 'USD',
    rate: String(lastRates.USD || ''),
    repeats: false,
  }
  const [editing, setEditing] = useState<string | null>(null)
  const [form, setForm] = useState(blank)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  async function run(fn: () => Promise<unknown>) {
    setSaving(true)
    setErr('')
    setMsg('')
    try {
      await fn()
      onChange()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setSaving(false)
    }
  }

  const add = () =>
    run(async () => {
      await consoleFetch('/api/v2/finance/expenses', { method: 'POST', body: JSON.stringify({ ...form, month }) })
      setForm((p) => ({ ...blank, category: p.category, currency: p.currency, rate: p.rate, repeats: p.repeats }))
    })
  const remove = (e: ExpenseRow) => {
    if (e.repeats && !window.confirm(`Remove "${e.label || EXPENSE_LABEL[e.category]}" from ${monthLabel(month)} onwards and stop repeating it?`)) return
    run(() => consoleFetch(`/api/v2/finance/expenses/${e.id}`, { method: 'DELETE' }))
  }
  const save = (id: string, body: Record<string, unknown>) =>
    run(async () => {
      await consoleFetch(`/api/v2/finance/expenses/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
      setEditing(null)
    })
  const copy = () =>
    run(async () => {
      const res = await consoleFetch('/api/v2/finance/expenses/copy-salaries', { method: 'POST', body: JSON.stringify({ month }) })
      setMsg(res.copied ? `Copied ${res.copied} salary ${res.copied === 1 ? 'line' : 'lines'} from last month.` : 'No new salaries to copy from last month.')
    })

  const placeholder: Record<ExpenseCategory, string> = {
    ad_spend: 'e.g. Google Ads, Instagram',
    salary: 'Employee name',
    software: 'e.g. Zoho, Vercel',
    office: 'e.g. Rent, phone',
    other: 'What it was for',
  }

  return (
    <div>
      <div className="ll-card ll-fin-add">
        <div className="ll-form ll-fin-fields">
          <label>
            Type
            <select
              value={form.category}
              onChange={(e) => {
                const category = e.target.value as ExpenseCategory
                const currency = category === 'ad_spend' ? 'USD' : BASE_CURRENCY
                setForm((p) => ({
                  ...p,
                  category,
                  currency,
                  rate: currency === BASE_CURRENCY ? '1' : String(lastRates[currency] || ''),
                  repeats: category === 'salary' || category === 'software' || category === 'office',
                }))
              }}
            >
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {EXPENSE_LABEL[c]}
                </option>
              ))}
            </select>
          </label>
          <label>
            For
            <input value={form.label} placeholder={placeholder[form.category]} onChange={(e) => setForm({ ...form, label: e.target.value })} />
          </label>
          <label>
            Amount
            <input inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          </label>
          <label>
            Currency
            <CurrencyPicker
              value={form.currency}
              onChange={(c) => setForm({ ...form, currency: c, rate: c === BASE_CURRENCY ? '1' : String(lastRates[c] || '') })}
            />
          </label>
          {form.currency !== BASE_CURRENCY && (
            <label>
              1 {form.currency} = ? {BASE_CURRENCY}
              <input inputMode="decimal" value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} />
            </label>
          )}
        </div>
        <div className="ll-row" style={{ marginTop: 14 }}>
          <label className="ll-fin-check">
            <input type="checkbox" checked={form.repeats} onChange={(e) => setForm({ ...form, repeats: e.target.checked })} />
            Repeats monthly
          </label>
          <button className="ll-btn" onClick={add} disabled={saving || !form.amount}>
            Add expense
          </button>
          <button className="ll-btn secondary" onClick={copy} disabled={saving}>
            Copy last month&apos;s salaries
          </button>
          {msg && <span className="ll-muted">{msg}</span>}
        </div>
        {err && <div className="ll-error">{err}</div>}
      </div>

      <div className="ll-table-wrap">
        <table className="ll-table">
          <thead>
            <tr>
              <th>Type</th>
              <th>For</th>
              <th>Amount</th>
              <th>In {BASE_CURRENCY}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {busy ? (
              <SkeletonRows cols={5} />
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="ll-muted">
                  No expenses entered for this month.
                </td>
              </tr>
            ) : (
              EXPENSE_CATEGORIES.flatMap((c) => rows.filter((e) => e.category === c)).map((e) =>
                editing === e.id ? (
                  <ExpenseEdit key={e.id} row={e} saving={saving} onSave={(body) => save(e.id, body)} onCancel={() => setEditing(null)} />
                ) : (
                  <tr key={e.id}>
                    <td>{EXPENSE_LABEL[e.category]}</td>
                    <td>
                      {e.label || '—'}
                      {e.repeats && <span className="ll-fin-repeat">Monthly</span>}
                    </td>
                    <td>{fmt(e.amount, e.currency)}</td>
                    <td>{fmt(e.base_amount)}</td>
                    <td className="ll-fin-actions">
                      <button className="ll-btn ghost" onClick={() => setEditing(e.id)} disabled={saving}>
                        Edit
                      </button>
                      <button className="ll-btn ghost" onClick={() => remove(e)} disabled={saving} aria-label="Delete expense">
                        ×
                      </button>
                    </td>
                  </tr>
                )
              )
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ExpenseEdit({
  row,
  saving,
  onSave,
  onCancel,
}: {
  row: ExpenseRow
  saving: boolean
  onSave: (body: Record<string, unknown>) => void
  onCancel: () => void
}) {
  const [f, setF] = useState({
    label: row.label,
    amount: String(row.amount),
    currency: row.currency,
    rate: String(row.rate),
    repeats: !!row.repeats,
  })
  return (
    <tr className="ll-fin-editing">
      <td>{EXPENSE_LABEL[row.category]}</td>
      <td>
        <input value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} aria-label="For" />
        <label className="ll-fin-check">
          <input type="checkbox" checked={f.repeats} onChange={(e) => setF({ ...f, repeats: e.target.checked })} />
          Repeats monthly
        </label>
      </td>
      <td>
        <div className="ll-fin-inline">
          <input inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} aria-label="Amount" />
          <CurrencyPicker value={f.currency} onChange={(c) => setF({ ...f, currency: c, rate: c === BASE_CURRENCY ? '1' : f.rate })} />
        </div>
        {f.currency !== BASE_CURRENCY && (
          <input
            inputMode="decimal"
            value={f.rate}
            onChange={(e) => setF({ ...f, rate: e.target.value })}
            aria-label={`1 ${f.currency} in ${BASE_CURRENCY}`}
            placeholder={`1 ${f.currency} = ? ${BASE_CURRENCY}`}
          />
        )}
        {row.repeats && <span className="ll-muted">Also changes the months after this one.</span>}
      </td>
      <td colSpan={2} className="ll-fin-actions">
        <button className="ll-btn" onClick={() => onSave(f)} disabled={saving}>
          Save
        </button>
        <button className="ll-btn ghost" onClick={onCancel}>
          Cancel
        </button>
      </td>
    </tr>
  )
}

function Trend({ months, onPick, current }: { months: MonthTotals[]; onPick: (m: string) => void; current: string }) {
  if (!months.length) return <div className="ll-card ll-muted">Loading…</div>
  // Skip the empty months before anything was recorded.
  const first = months.findIndex((m) => m.income || m.trip_costs || m.expenses_total || m.month === current)
  const shown = months.slice(Math.max(0, first))
  const max = Math.max(1, ...shown.map((m) => Math.max(m.income, m.trip_costs + m.expenses_total)))
  return (
    <div className="ll-table-wrap">
      <table className="ll-table ll-fin-trend">
        <thead>
          <tr>
            <th>Month</th>
            <th>Income</th>
            <th>Spent</th>
            <th>Net profit</th>
            <th aria-hidden />
          </tr>
        </thead>
        <tbody>
          {[...shown].reverse().map((m) => {
            const spent = m.trip_costs + m.expenses_total
            return (
              <tr key={m.month} className={m.month === current ? 'on' : ''} onClick={() => onPick(m.month)}>
                <td>{monthLabel(m.month, true)}</td>
                <td>{fmt(m.income)}</td>
                <td>{fmt(spent)}</td>
                <td className={m.net_profit < 0 ? 'll-fin-loss' : ''}>{fmt(m.net_profit)}</td>
                <td className="ll-fin-bars" aria-hidden>
                  <i className="in" style={{ width: `${(m.income / max) * 100}%` }} />
                  <i className="out" style={{ width: `${(spent / max) * 100}%` }} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
