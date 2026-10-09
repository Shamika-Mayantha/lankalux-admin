'use client'

import { useState } from 'react'
import { useConsoleGet } from '@/lib/console-api'
import { formatDay } from '@/lib/format'
import { SkeletonRows } from '@/components/ui/RowLink'
import type { Money, PerformanceRange, PerformanceReport } from '@/services/performance.service'

const RANGE_LABEL: Record<PerformanceRange, string> = {
  week: 'This week',
  month: 'This month',
  quarter: 'This quarter',
  year: 'This year',
}

const PREVIOUS_LABEL: Record<PerformanceRange, string> = {
  week: 'last week',
  month: 'last month',
  quarter: 'last quarter',
  year: 'last year',
}

function pct(value: number | null) {
  return value == null ? '—' : `${Math.round(value * 100)}%`
}

function money(list: Money[]) {
  if (list.length === 0) return '—'
  return list
    .map((m) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: m.currency, maximumFractionDigits: 0 }).format(m.amount))
    .join(' · ')
}

function Change({ now, before, range }: { now: number; before: number; range: PerformanceRange }) {
  const diff = now - before
  const sign = diff > 0 ? '+' : ''
  return (
    <span className="ll-muted ll-perf-change">
      {diff === 0 ? 'Same as' : `${sign}${diff} vs`} {PREVIOUS_LABEL[range]} ({before})
    </span>
  )
}

function WeeklyChart({ weeks }: { weeks: PerformanceReport['weekly'] }) {
  const max = Math.max(1, ...weeks.map((w) => w.enquiries))
  return (
    <div>
      <div className="ll-perf-legend">
        <span>
          <i className="ll-perf-swatch enquiries" /> Enquiries
        </span>
        <span>
          <i className="ll-perf-swatch sold" /> Sold
        </span>
      </div>
      <div className="ll-perf-chart" role="img" aria-label="Enquiries and sales per week for the last 12 weeks">
        {weeks.map((w) => (
          <div className="ll-perf-week" key={w.week_start} title={`Week of ${formatDay(w.week_start)}: ${w.enquiries} enquiries, ${w.sold} sold`}>
            <div className="ll-perf-bars">
              <div className="ll-perf-bar enquiries" style={{ height: `${(w.enquiries / max) * 100}%` }}>
                {w.enquiries > 0 && <span>{w.enquiries}</span>}
              </div>
              <div className="ll-perf-bar sold" style={{ height: `${(w.sold / max) * 100}%` }}>
                {w.sold > 0 && <span>{w.sold}</span>}
              </div>
            </div>
            <span className="ll-perf-axis">{formatDay(w.week_start).replace(/,? \d{4}$/, '')}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function PerformancePage() {
  const [range, setRange] = useState<PerformanceRange>('week')
  const { data, error, loading } = useConsoleGet<{ report?: PerformanceReport }>(`/api/v2/performance?range=${range}`)
  const r = data?.report
  const busy = loading && !r

  return (
    <div>
      <h1 className="ll-h1">Performance</h1>
      <p className="ll-sub">How enquiries are converting, what has been paid, and who is carrying the work.</p>
      {error && <div className="ll-error">{error}</div>}
      <div className="ll-row" style={{ marginBottom: 18 }}>
        {(Object.keys(RANGE_LABEL) as PerformanceRange[]).map((k) => (
          <button key={k} className={`ll-btn ${range === k ? '' : 'secondary'}`} onClick={() => setRange(k)}>
            {RANGE_LABEL[k]}
          </button>
        ))}
      </div>

      <div className="ll-grid">
        <div className="ll-card">
          <h3>Enquiries</h3>
          <p className="ll-stat">{busy ? <span className="ll-skel ll-skel-stat" /> : r?.enquiries.current}</p>
          {r && <Change now={r.enquiries.current} before={r.enquiries.previous} range={range} />}
        </div>
        <div className="ll-card">
          <h3>Sold</h3>
          <p className="ll-stat">{busy ? <span className="ll-skel ll-skel-stat" /> : r?.sold.current}</p>
          {r && <Change now={r.sold.current} before={r.sold.previous} range={range} />}
        </div>
        <div className="ll-card">
          <h3>Conversion</h3>
          <p className="ll-stat">{busy ? <span className="ll-skel ll-skel-stat" /> : pct(r?.conversion.current ?? null)}</p>
          {r && (
            <span className="ll-muted ll-perf-change">
              Of {RANGE_LABEL[range].toLowerCase()}&apos;s enquiries · all time {pct(r.conversion.all_time)}
            </span>
          )}
        </div>
        <div className="ll-card">
          <h3>Revenue received</h3>
          <p className="ll-stat ll-perf-money">{busy ? <span className="ll-skel ll-skel-stat" /> : money(r?.revenue.current || [])}</p>
          {r && (
            <span className="ll-muted ll-perf-change">
              {PREVIOUS_LABEL[range][0].toUpperCase() + PREVIOUS_LABEL[range].slice(1)}: {money(r.revenue.previous)}
            </span>
          )}
        </div>
        <div className="ll-card">
          <h3>Open enquiries</h3>
          <p className="ll-stat">{busy ? <span className="ll-skel ll-skel-stat" /> : r?.open}</p>
          {r && <span className="ll-muted ll-perf-change">{r.unassigned_open} not assigned to an agent</span>}
        </div>
      </div>

      <section className="ll-category">
        <div className="ll-category-head">
          <h2>Agent workload</h2>
          <span className="ll-muted">Requests count for the assigned agent, or whoever created them.</span>
        </div>
        <table className="ll-table">
          <thead>
            <tr>
              <th>Agent</th>
              <th>Open now</th>
              <th>New ({RANGE_LABEL[range].toLowerCase()})</th>
              <th>Sold ({RANGE_LABEL[range].toLowerCase()})</th>
              <th>Revenue received</th>
              <th>Conversion (all time)</th>
            </tr>
          </thead>
          <tbody>
            {busy ? (
              <SkeletonRows cols={6} />
            ) : !r || r.agents.length === 0 ? (
              <tr>
                <td colSpan={6} className="ll-muted">
                  No team members yet.
                </td>
              </tr>
            ) : (
              r.agents.map((a) => (
                <tr key={a.user_id || 'not-assigned'}>
                  <td>
                    {a.name}
                    {a.role === 'supervisor' && <span className="ll-muted"> · supervisor</span>}
                  </td>
                  <td>{a.open}</td>
                  <td>{a.enquiries}</td>
                  <td>{a.sold}</td>
                  <td>{money(a.revenue)}</td>
                  <td>{pct(a.conversion)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      <section className="ll-category">
        <div className="ll-category-head">
          <h2>Last 12 weeks</h2>
        </div>
        <div className="ll-card">{r ? <WeeklyChart weeks={r.weekly} /> : <p className="ll-muted">Loading…</p>}</div>
      </section>
    </div>
  )
}
