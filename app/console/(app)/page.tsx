'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { ArrowRight, MessageCircle, PlaneLanding, PlaneTakeoff, Reply, Sparkles } from 'lucide-react'
import { useConsoleGet } from '@/lib/console-api'
import { formatAgo, formatDay, formatDayRange } from '@/lib/format'
import { RowLink } from '@/components/ui/RowLink'
import { REQUEST_STATUSES, STATUS_LABEL, normalizeStatus, type RequestStatus } from '@/config/status'
import { useIsSupervisor, useMe } from '@/features/console/StaffContext'
import { useFollowUps } from '@/features/requests/FollowUpPanel'
import type { ClientRequestRow } from '@/types/domain'
import type { AiOverview } from '@/services/ai-console.service'

type Range = 'today' | 'week' | 'month' | 'all'

const RANGE_LABEL: Record<Range, string> = {
  today: 'Today',
  week: 'This week',
  month: 'This month',
  all: 'All time',
}

const DASHBOARD_STATUS_LABEL: Record<RequestStatus, string> = {
  new: 'New',
  follow_up: 'Follow up',
  sold: 'Sold',
  after_sales: 'After sales',
  cancelled: 'Cancelled',
  expired: 'Expired',
}

/** Rows shown in the requests table before "Open in Requests". */
const TABLE_ROWS = 8

function startOfRange(range: Range) {
  if (range === 'all') return null
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  if (range === 'week') d.setDate(d.getDate() - d.getDay())
  if (range === 'month') d.setDate(1)
  return d
}

function inCreatedRange(createdAt: string | null | undefined, range: Range) {
  const from = startOfRange(range)
  if (!from) return true
  if (!createdAt) return false
  const created = new Date(createdAt)
  if (Number.isNaN(created.getTime())) return false
  return created >= from
}

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

function requestStatus(row: ClientRequestRow): RequestStatus {
  return normalizeStatus(row.status) || 'new'
}

function firstName(name: string) {
  return name.split(/[\s@]/)[0]
}

function waited(hours: number) {
  if (hours < 48) return `${hours}h`
  return `${Math.floor(hours / 24)} days`
}

/** The AI server checks in every minute; three minutes without a heartbeat means offline. */
function anyAgentOnline(ai: AiOverview | undefined) {
  return !!ai?.agents.some((a) => a.last_heartbeat_at && Date.now() - new Date(a.last_heartbeat_at).getTime() < 3 * 60 * 1000)
}

type Attention = { key: string; href: string; icon: 'reply' | 'chase' | 'ai'; title: string; detail: string }

export default function DashboardPage() {
  const me = useMe()
  const supervisor = useIsSupervisor()
  const { data, error, loading } = useConsoleGet<{ requests?: ClientRequestRow[] }>('/api/v2/requests')
  const { data: followUps } = useFollowUps()
  const { data: aiData } = useConsoleGet<{ overview?: AiOverview }>(supervisor ? '/api/v2/ai' : null)
  const ai = aiData?.overview
  const rows = useMemo(() => data?.requests || [], [data])
  const [range, setRange] = useState<Range>('all')
  const [status, setStatus] = useState<RequestStatus>('new')

  const rangedRows = useMemo(() => rows.filter((r) => inCreatedRange(r.created_at, range)), [rows, range])

  const grouped = useMemo(() => {
    const g = Object.fromEntries(REQUEST_STATUSES.map((s) => [s, [] as ClientRequestRow[]])) as Record<RequestStatus, ClientRequestRow[]>
    for (const r of rangedRows) g[requestStatus(r)].push(r)
    for (const s of REQUEST_STATUSES) g[s].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    return g
  }, [rangedRows])

  // Local calendar day (toISOString would be yesterday's date before 05:30 in Sri Lanka).
  const now = new Date()
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

  const comingUp = useMemo(() => {
    const sold = rows.filter((r) => requestStatus(r) === 'sold')
    const events = [
      ...sold.filter((r) => r.start_date && r.start_date >= today).map((r) => ({ r, kind: 'arrive' as const, date: r.start_date as string })),
      ...sold.filter((r) => r.end_date && r.end_date >= today).map((r) => ({ r, kind: 'depart' as const, date: r.end_date as string })),
    ]
    return events.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 6)
  }, [rows, today])

  const attention = useMemo<Attention[]>(() => {
    const list: Attention[] = []
    for (const a of ai?.pending || []) {
      list.push({
        key: `ai-${a.id}`,
        href: '/console/ai',
        icon: 'ai',
        title: a.summary,
        detail: `${a.payload?.channel === 'email' ? 'Email to approve' : a.action_type.startsWith('message.') ? 'WhatsApp reply to approve' : 'AI action to approve'} · ${formatAgo(a.created_at)}`,
      })
    }
    const listed = new Set((ai?.pending || []).map((a) => a.id))
    for (const p of ai?.pings || []) {
      if (p.action_id && listed.has(p.action_id)) continue
      list.push({ key: `ping-${p.id}`, href: p.request_id ? `/console/requests/${p.request_id}` : '/console/ai', icon: 'ai', title: p.title, detail: `AI Manager · ${formatAgo(p.created_at)}` })
    }
    for (const f of followUps?.items || []) {
      list.push({
        key: `fu-${f.requestId}-${f.kind}`,
        href: `/console/requests/${f.requestId}`,
        icon: f.kind,
        title: f.kind === 'reply' ? `Reply to ${f.clientName}` : `Follow up with ${f.clientName}`,
        detail: f.kind === 'reply' ? `Waiting on us for ${waited(f.hoursWaiting)}` : `Quiet for ${waited(f.hoursWaiting)}`,
      })
    }
    return list
  }, [ai, followUps])

  const shown = grouped[status]
  const aiOnline = anyAgentOnline(ai)

  return (
    <div className="ll-dash">
      <div className="ll-page-head">
        <div>
          <h1 className="ll-greeting">
            {greeting()}, {firstName(me.name || me.email || '')}
          </h1>
          <p className="ll-sub">
            {now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
            {attention.length > 0 && ` · ${attention.length} ${attention.length === 1 ? 'thing needs' : 'things need'} you`}
          </p>
        </div>
        <div className="ll-seg" role="group" aria-label="Enquiries created">
          {(['today', 'week', 'month', 'all'] as Range[]).map((r) => (
            <button key={r} type="button" className={range === r ? 'on' : ''} aria-pressed={range === r} onClick={() => setRange(r)}>
              {RANGE_LABEL[r]}
            </button>
          ))}
        </div>
      </div>
      {error && <div className="ll-error">{error}</div>}

      <div className="ll-pipeline" role="group" aria-label="Requests by status">
        {REQUEST_STATUSES.map((s) => (
          <button key={s} type="button" className={`ll-pipe ${s} ${status === s ? 'on' : ''}`} aria-pressed={status === s} onClick={() => setStatus(s)}>
            <span className="ll-pipe-label">{DASHBOARD_STATUS_LABEL[s]}</span>
            <span className="ll-pipe-count">{loading ? <span className="ll-skel ll-skel-stat" /> : grouped[s].length}</span>
          </button>
        ))}
      </div>

      <div className="ll-dash-grid">
        <section className="ll-card ll-panel">
          <div className="ll-panel-head">
            <h2>Needs you</h2>
            {attention.length > 0 && <span className="ll-count">{attention.length}</span>}
          </div>
          {attention.length === 0 ? (
            <p className="ll-empty">You&apos;re all caught up. New replies and approvals will show here.</p>
          ) : (
            <ul className="ll-attn">
              {attention.slice(0, 7).map((a) => (
                <li key={a.key}>
                  <Link href={a.href}>
                    <span className={`ll-attn-icon ${a.icon}`} aria-hidden>
                      {a.icon === 'ai' ? <Sparkles size={16} /> : a.icon === 'reply' ? <Reply size={16} /> : <MessageCircle size={16} />}
                    </span>
                    <span className="ll-attn-text">
                      <strong>{a.title}</strong>
                      <small>{a.detail}</small>
                    </span>
                    <ArrowRight size={16} className="ll-attn-go" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="ll-dash-side">
          {supervisor && (
            <Link href="/console/ai" className="ll-card ll-panel ll-ai-teaser">
              <div className="ll-panel-head">
                <h2>AI team</h2>
                <span className={`ll-status ${ai && !ai.settings.system_paused && aiOnline ? 'on' : ''}`}>
                  {!ai ? '…' : ai.settings.system_paused ? 'Paused' : aiOnline ? 'Working' : 'Server offline'}
                </span>
              </div>
              {ai && (
                <div className="ll-mini-stats">
                  <span>
                    <strong>{ai.counts.running}</strong> running
                  </span>
                  <span>
                    <strong>{ai.counts.queued}</strong> queued
                  </span>
                  <span>
                    <strong>{ai.counts.executed_today}</strong> done today
                  </span>
                </div>
              )}
              <span className="ll-panel-link">
                Open the control room <ArrowRight size={14} aria-hidden />
              </span>
            </Link>
          )}
          <section className="ll-card ll-panel">
            <div className="ll-panel-head">
              <h2>Coming up</h2>
            </div>
            {loading ? (
              <p className="ll-empty">Loading…</p>
            ) : comingUp.length === 0 ? (
              <p className="ll-empty">No arrivals or departures booked.</p>
            ) : (
              <ul className="ll-timeline">
                {comingUp.map(({ r, kind, date }) => (
                  <li key={`${r.id}-${kind}`}>
                    <span className={`ll-tl-icon ${kind}`} aria-hidden>
                      {kind === 'arrive' ? <PlaneLanding size={14} /> : <PlaneTakeoff size={14} />}
                    </span>
                    <Link href={`/console/requests/${r.id}`}>{r.client_name}</Link>
                    <small>
                      {kind === 'arrive' ? 'Arrives' : 'Leaves'} {date === today ? 'today' : formatDay(date)}
                    </small>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      <section className="ll-category">
        <div className="ll-category-head">
          <h2>
            {DASHBOARD_STATUS_LABEL[status]} <span className="ll-muted">({shown.length})</span>
          </h2>
          <Link href={`/console/requests?status=${status}`} className="ll-btn secondary small">
            Open in Requests
          </Link>
        </div>
        {loading ? (
          <p className="ll-muted">Loading requests…</p>
        ) : shown.length === 0 ? (
          <div className="ll-card">
            <p className="ll-empty">No {DASHBOARD_STATUS_LABEL[status].toLowerCase()} requests {range === 'all' ? '' : RANGE_LABEL[range].toLowerCase()}.</p>
          </div>
        ) : (
          <table className="ll-table">
            <thead>
              <tr>
                <th>Client</th>
                <th>Reference</th>
                <th>Travel dates</th>
                <th>Received</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {shown.slice(0, TABLE_ROWS).map((r) => {
                const s = requestStatus(r)
                const href = `/console/requests/${r.id}`
                return (
                  <RowLink key={r.id} href={href}>
                    <td>
                      <Link href={href}>
                        <strong>{r.client_name}</strong>
                      </Link>
                    </td>
                    <td className="ll-muted">{r.id}</td>
                    <td>{formatDayRange(r.start_date, r.end_date)}</td>
                    <td className="ll-muted">{formatAgo(r.created_at)}</td>
                    <td>
                      <span className={`ll-pill ${s}`}>{STATUS_LABEL[s]}</span>
                    </td>
                  </RowLink>
                )
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
