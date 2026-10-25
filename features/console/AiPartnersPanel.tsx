'use client'

import { useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { consoleFetch, useConsoleGet } from '@/lib/console-api'
import { formatAgo } from '@/lib/format'
import type { AiPartner } from '@/services/ai-partners.service'

const STATUS: Record<AiPartner['status'], { label: string; pill: string }> = {
  new: { label: 'Waiting to be read', pill: 'expired' },
  researched: { label: 'Ready, in the queue', pill: 'new' },
  not_fit: { label: 'Not a fit', pill: 'cancelled' },
  failed: { label: 'Could not read', pill: 'cancelled' },
  drafted: { label: 'Email waiting for you', pill: 'follow_up' },
  emailed: { label: 'Emailed', pill: 'sold' },
  replied: { label: 'Replied', pill: 'sold' },
}

const KIND: Record<string, string> = {
  travel_agent: 'Travel agent',
  honeymoon_planner: 'Honeymoon planner',
  wedding_planner: 'Wedding planner',
  tour_operator: 'Tour operator',
  other: 'Other',
}

/** Travel businesses abroad the Partner agent introduces LankaLux to, one approved email at a time. */
export function AiPartnersPanel() {
  const { data, error, loading, reload } = useConsoleGet<{ partners?: AiPartner[] }>('/api/v2/ai/partners')
  const [websites, setWebsites] = useState('')
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const partners = data?.partners || []

  async function act(fn: () => Promise<unknown>) {
    setBusy(true)
    setActionError(null)
    setNotice(null)
    try {
      await fn()
      await reload()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  function add() {
    act(async () => {
      const r = (await consoleFetch('/api/v2/ai/partners', { method: 'POST', body: JSON.stringify({ websites }) })) as {
        added: number
        already: number
        invalid: number
      }
      setWebsites('')
      setNotice(
        [`${r.added} added`, r.already && `${r.already} already on the list`, r.invalid && `${r.invalid} not website addresses`]
          .filter(Boolean)
          .join(' · ') + '. The Partner agent reads new sites within the hour (8am to 8pm Sri Lanka time).'
      )
    })
  }

  return (
    <section>
      <div className="ll-card ll-panel" style={{ marginBottom: 16 }}>
        <div className="ll-panel-head">
          <div>
            <h2>Partners</h2>
            <p className="ll-muted ll-small" style={{ margin: '4px 0 0' }}>
              Travel agents, honeymoon and wedding planners and tour operators abroad who could send you clients. Paste their websites; the Partner agent reads only their public pages, finds their business email, and drafts an introduction. At most 5 a day reach your Approvals, and nothing is sent until you approve it.
            </p>
          </div>
        </div>
        <div className="ll-form">
          <label>
            Websites, one per line
            <textarea rows={4} value={websites} onChange={(e) => setWebsites(e.target.value)} placeholder={'www.example-honeymoons.co.uk\nexample-travel.de'} />
          </label>
          <div className="ll-row">
            <button type="button" className="ll-btn small" disabled={busy || !websites.trim()} onClick={add}>
              Add websites
            </button>
          </div>
        </div>
      </div>
      {error && <div className="ll-error">{error}</div>}
      {actionError && <div className="ll-error">{actionError}</div>}
      {notice && <div className="ll-ok">{notice}</div>}
      {loading && !data ? (
        <p className="ll-muted">Loading…</p>
      ) : partners.length === 0 ? (
        <div className="ll-card">
          <p className="ll-empty">No partners yet. Add a few websites above.</p>
        </div>
      ) : (
        <div className="ll-ai-list">
          {partners.map((p) => (
            <div key={p.id} className="ll-card ll-ai-approval">
              <div className="ll-row" style={{ justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <span className={`ll-pill ${STATUS[p.status].pill}`}>{STATUS[p.status].label}</span>
                <span className="ll-muted ll-small">
                  {p.score !== null && `Fit ${p.score}/100 · `}added {formatAgo(p.created_at)}
                </span>
              </div>
              <h3 style={{ marginTop: 10 }}>
                <a href={p.website} target="_blank" rel="noopener noreferrer nofollow">
                  {p.name || p.website.replace(/^https?:\/\//, '')} <ExternalLink size={13} aria-hidden />
                </a>
              </h3>
              <p className="ll-muted ll-small" style={{ margin: '2px 0 6px' }}>
                {[p.kind && KIND[p.kind], p.country, p.contact_email || (p.researched_at && 'no email on their site')].filter(Boolean).join(' · ')}
                {p.contact_page && (
                  <>
                    {' · '}
                    <a href={p.contact_page} target="_blank" rel="noopener noreferrer nofollow">
                      contact page
                    </a>
                  </>
                )}
              </p>
              {p.summary && <p className="ll-small" style={{ margin: '4px 0' }}>{p.summary}</p>}
              {p.reason && <p className="ll-muted ll-small">Why: {p.reason}</p>}
              {p.error && <p className="ll-agent-error">{p.error}</p>}
              {p.quality_notes.length > 0 && <p className="ll-muted ll-small">Check: {p.quality_notes.map((n) => n.note).join(' ')}</p>}
              <div className="ll-row" style={{ marginTop: 10, gap: 8, flexWrap: 'wrap' }}>
                {p.status === 'emailed' && (
                  <button type="button" className="ll-btn small" disabled={busy} onClick={() => act(() => consoleFetch(`/api/v2/ai/partners/${p.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'replied' }) }))}>
                    They replied
                  </button>
                )}
                {['researched', 'new', 'failed'].includes(p.status) && (
                  <button type="button" className="ll-btn small secondary" disabled={busy} onClick={() => act(() => consoleFetch(`/api/v2/ai/partners/${p.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'not_fit' }) }))}>
                    Not a fit
                  </button>
                )}
                {['not_fit', 'failed'].includes(p.status) && (
                  <button type="button" className="ll-btn small secondary" disabled={busy} onClick={() => act(() => consoleFetch(`/api/v2/ai/partners/${p.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'new' }) }))}>
                    Read again
                  </button>
                )}
                {['new', 'researched', 'not_fit', 'failed'].includes(p.status) && (
                  <button type="button" className="ll-btn small secondary" disabled={busy} onClick={() => act(() => consoleFetch(`/api/v2/ai/partners/${p.id}`, { method: 'DELETE' }))}>
                    Remove
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
