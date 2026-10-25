'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Copy, ExternalLink, UserPlus } from 'lucide-react'
import { consoleFetch, useConsoleGet } from '@/lib/console-api'
import { formatAgo } from '@/lib/format'
import type { AiLead, AiLeadList, AiLeadScan } from '@/services/ai-leads.service'

type View = 'open' | 'all'

const STATUS_LABEL: Record<AiLead['status'], string> = {
  new: 'New',
  replied: 'Replied',
  not_relevant: 'Not relevant',
  converted: 'Request',
}

function scoreClass(score: number | null) {
  if (score === null) return 'expired'
  if (score >= 80) return 'sold'
  if (score >= 50) return 'new'
  return 'expired'
}

/** "Last search 2h ago · 4 new leads · Reddit not set up" from the scout's latest search. */
function scanLine(scan: AiLeadScan | null): string {
  if (!scan) return 'No search yet. The Lead Scout searches at 9am and 5pm Sri Lanka time while the AI system is running.'
  if (scan.status === 'failed') return `The last search failed ${formatAgo(scan.finished_at)}: ${scan.error || 'unknown error'}`
  const r = scan.result || {}
  const parts = [`Last search ${formatAgo(scan.finished_at)}`]
  if (typeof r.new_leads === 'number') parts.push(`${r.new_leads} new lead${r.new_leads === 1 ? '' : 's'} from ${r.posts_read ?? 0} posts`)
  if (r.reddit === 'not set up') parts.push('Reddit is not set up yet')
  else if (r.reddit && typeof r.reddit === 'object' && Object.keys((r.reddit as { errors?: object }).errors || {}).length) parts.push('some Reddit searches failed')
  if (r.feeds && typeof r.feeds === 'object' && Object.keys((r.feeds as { errors?: object }).errors || {}).length) parts.push('some feeds could not be read')
  return parts.join(' · ')
}

function DetailChips({ lead }: { lead: AiLead }) {
  const d = lead.details || {}
  const chips = [d.dates, d.party, d.places?.join(', '), d.interests, d.budget && `Budget: ${d.budget}`].filter(Boolean) as string[]
  if (!chips.length) return null
  return (
    <p className="ll-lead-chips">
      {chips.map((c) => (
        <span key={c}>{c}</span>
      ))}
    </p>
  )
}

function LeadCard({ lead, busy, onStatus, onConvert }: {
  lead: AiLead
  busy: boolean
  onStatus: (status: 'new' | 'replied' | 'not_relevant') => void
  onConvert: (contact: { name: string; email: string; whatsapp: string }) => void
}) {
  const [reply, setReply] = useState(lead.draft_reply || '')
  const [copied, setCopied] = useState(false)
  const [converting, setConverting] = useState(false)
  const [contact, setContact] = useState({ name: lead.author || '', email: '', whatsapp: '' })
  const hard = lead.quality_notes.filter((n) => n.level === 'hard')
  const soft = lead.quality_notes.filter((n) => n.level === 'soft')
  const open = lead.status === 'new'

  async function copy() {
    try {
      await navigator.clipboard.writeText(reply)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="ll-card ll-ai-approval">
      <div className="ll-row" style={{ justifyContent: 'space-between', gap: 8 }}>
        <span className={`ll-pill ${scoreClass(lead.score)}`}>Fit {lead.score ?? '?'}/100</span>
        <span className="ll-muted ll-small">
          {lead.source_detail || lead.source}
          {lead.author && ` · ${lead.author}`}
          {lead.posted_at && ` · posted ${formatAgo(lead.posted_at)}`}
        </span>
      </div>
      <h3 style={{ marginTop: 10 }}>
        <a href={lead.url} target="_blank" rel="noopener noreferrer nofollow">
          {lead.title || lead.url}
        </a>
      </h3>
      {lead.summary && <p className="ll-small" style={{ margin: '4px 0' }}>{lead.summary}</p>}
      <DetailChips lead={lead} />
      {lead.excerpt && (
        <details className="ll-small">
          <summary className="ll-muted">Their post</summary>
          <p className="ll-ai-bubble in" style={{ maxWidth: '100%' }}>{lead.excerpt}</p>
        </details>
      )}
      {!open ? (
        <p className="ll-small" style={{ marginTop: 10 }}>
          <span className={`ll-pill ${lead.status === 'converted' ? 'sold' : 'expired'}`}>{STATUS_LABEL[lead.status]}</span>{' '}
          {lead.request_id ? (
            <Link href={`/console/requests/${lead.request_id}`}>{lead.request_id}</Link>
          ) : (
            <button type="button" className="ll-btn small secondary" disabled={busy} onClick={() => onStatus('new')}>
              Move back to new
            </button>
          )}
        </p>
      ) : (
        <>
          {hard.map((n) => (
            <p key={n.note} className="ll-ai-flag">Fix before posting: {n.note}</p>
          ))}
          <label className="ll-small ll-muted" htmlFor={`lead-${lead.id}`}>
            Suggested reply (edit it, copy it, and post it yourself from the LankaLux account)
          </label>
          <textarea id={`lead-${lead.id}`} className="ll-ai-reply" rows={6} value={reply} onChange={(e) => setReply(e.target.value)} />
          {soft.length > 0 && <p className="ll-muted ll-small">Check: {soft.map((n) => n.note).join(' ')}</p>}
          {lead.reason && <p className="ll-muted ll-small">Why this score: {lead.reason}</p>}
          <div className="ll-row" style={{ marginTop: 12, gap: 8, flexWrap: 'wrap' }}>
            <a className="ll-btn small secondary" href={lead.url} target="_blank" rel="noopener noreferrer nofollow">
              <ExternalLink size={14} aria-hidden /> Open post
            </a>
            <button type="button" className="ll-btn small secondary" disabled={!reply.trim()} onClick={copy}>
              <Copy size={14} aria-hidden /> {copied ? 'Copied' : 'Copy reply'}
            </button>
            <button type="button" className="ll-btn small" disabled={busy} onClick={() => onStatus('replied')}>
              Mark replied
            </button>
            <button type="button" className="ll-btn small secondary" disabled={busy} onClick={() => onStatus('not_relevant')}>
              Not relevant
            </button>
            <button type="button" className="ll-btn small secondary" disabled={busy} onClick={() => setConverting((v) => !v)}>
              <UserPlus size={14} aria-hidden /> Create request
            </button>
          </div>
          {converting && (
            <div className="ll-form" style={{ marginTop: 12 }}>
              <p className="ll-muted ll-small" style={{ margin: 0 }}>
                Their name and any contact details they gave you. The post, the trip details and the link go into the request notes.
              </p>
              <label>
                Name
                <input value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} />
              </label>
              <div className="ll-fields-2">
                <label>
                  Email <span className="ll-muted">(optional)</span>
                  <input type="email" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} />
                </label>
                <label>
                  WhatsApp <span className="ll-muted">(optional)</span>
                  <input value={contact.whatsapp} onChange={(e) => setContact({ ...contact, whatsapp: e.target.value })} />
                </label>
              </div>
              <div className="ll-row" style={{ gap: 8 }}>
                <button type="button" className="ll-btn small" disabled={busy || !contact.name.trim()} onClick={() => onConvert(contact)}>
                  Create the request
                </button>
                <button type="button" className="ll-btn small secondary" disabled={busy} onClick={() => setConverting(false)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

/** The Lead Scout's finds: people planning a Sri Lanka trip, best first, with a reply to post ourselves. */
export function AiLeadsPanel() {
  const [view, setView] = useState<View>('open')
  const { data, error, loading, reload } = useConsoleGet<AiLeadList>(`/api/v2/ai/leads${view === 'all' ? '?view=all' : ''}`)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function act(id: string, method: 'PATCH' | 'POST', body: unknown) {
    setBusy(true)
    setActionError(null)
    setNotice(null)
    try {
      const res = (await consoleFetch(`/api/v2/ai/leads/${id}`, { method, body: JSON.stringify(body) })) as { request_id?: string }
      if (res.request_id) setNotice(`Request ${res.request_id} created. The Sales agent picks it up like any new enquiry.`)
      await reload()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  const leads = data?.leads || []
  return (
    <section>
      <div className="ll-card ll-panel" style={{ marginBottom: 16 }}>
        <div className="ll-panel-head">
          <div>
            <h2>Leads found</h2>
            <p className="ll-muted ll-small" style={{ margin: '4px 0 0' }}>
              The Lead Scout reads public posts from people planning a Sri Lanka trip and drafts a helpful reply. It never posts or emails anyone: you reply from the LankaLux account, then mark the lead here.
            </p>
          </div>
          <div className="ll-seg ll-seg-sm" role="group" aria-label="Which leads">
            <button type="button" className={view === 'open' ? 'on' : ''} onClick={() => setView('open')}>
              Best first
            </button>
            <button type="button" className={view === 'all' ? 'on' : ''} onClick={() => setView('all')}>
              Everything
            </button>
          </div>
        </div>
        <p className="ll-small" style={{ margin: 0 }}>
          {data ? scanLine(data.lastScan) : 'Loading…'}
          {!!data?.unread && <span className="ll-muted"> · {data.unread} waiting to be read</span>}
          {view === 'open' && !!data?.weak && <span className="ll-muted"> · {data.weak} weak match{data.weak === 1 ? '' : 'es'} hidden</span>}
        </p>
      </div>
      {error && <div className="ll-error">{error}</div>}
      {actionError && <div className="ll-error">{actionError}</div>}
      {notice && <div className="ll-ok">{notice}</div>}
      {loading && !data ? (
        <p className="ll-muted">Loading…</p>
      ) : leads.length === 0 ? (
        <div className="ll-card">
          <p className="ll-empty">{view === 'open' ? 'No open leads right now. New ones appear after each search.' : 'No leads yet.'}</p>
        </div>
      ) : (
        <div className="ll-ai-list">
          {leads.map((l) => (
            <LeadCard
              key={l.id}
              lead={l}
              busy={busy}
              onStatus={(status) => act(l.id, 'PATCH', { status })}
              onConvert={(contact) => act(l.id, 'POST', contact)}
            />
          ))}
        </div>
      )}
    </section>
  )
}
