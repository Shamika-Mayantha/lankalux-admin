'use client'

import { ExternalLink } from 'lucide-react'
import { useConsoleGet } from '@/lib/console-api'
import { formatAgo } from '@/lib/format'
import type { ClaudeBot } from '@/services/claude-bots.service'

const STATUS = {
  running: { label: 'Running', pill: 'new' },
  succeeded: { label: 'Done', pill: 'sold' },
  failed: { label: 'Failed', pill: 'cancelled' },
} as const

/** Claude bots (code review, SEO, social media), which run on the Claude subscription. */
export function ClaudeBotsPanel() {
  const { data, error, loading } = useConsoleGet<{ bots?: ClaudeBot[] }>('/api/v2/ai/claude-bots')
  const bots = data?.bots || []

  return (
    <section>
      <div className="ll-card ll-panel" style={{ marginBottom: 16 }}>
        <div className="ll-panel-head">
          <div>
            <h2>Claude bots</h2>
            <p className="ll-muted ll-small" style={{ margin: '4px 0 0' }}>
              These run on your Claude subscription, separately from the AI team. Code fixes come as draft pull requests and drafts wait for you: nothing goes live or reaches a client until you say so.
            </p>
          </div>
        </div>
      </div>
      {error && <div className="ll-error">{error}</div>}
      {loading && !data ? (
        <p className="ll-muted">Loading…</p>
      ) : (
        <div className="ll-ai-list">
          {bots.map((b) => {
            const last = b.runs[0]
            return (
              <div key={b.key} className="ll-card ll-ai-approval">
                <div className="ll-row" style={{ justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <h3 style={{ margin: 0 }}>{b.name}</h3>
                  {last ? (
                    <span className={`ll-pill ${STATUS[last.status].pill}`}>{STATUS[last.status].label}</span>
                  ) : (
                    <span className="ll-pill expired">Not run yet</span>
                  )}
                </div>
                <p className="ll-muted ll-small" style={{ margin: '4px 0 6px' }}>
                  {b.schedule}
                  {last && ` · last run ${formatAgo(last.started_at)}`}
                </p>
                <p className="ll-small" style={{ margin: '4px 0' }}>{b.does}</p>
                {b.runs.map((r) => (
                  <div key={r.id} style={{ borderTop: '1px solid var(--ll-line, #e6e1d6)', marginTop: 10, paddingTop: 10 }}>
                    <p className="ll-muted ll-small" style={{ margin: 0 }}>
                      {new Date(r.started_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} · {STATUS[r.status].label}
                    </p>
                    {r.summary && <p className="ll-small" style={{ margin: '4px 0', whiteSpace: 'pre-line' }}>{r.summary}</p>}
                    {r.links.length > 0 && (
                      <p className="ll-small" style={{ margin: '4px 0' }}>
                        {r.links.map((l, i) => (
                          <span key={l.url}>
                            {i > 0 && ' · '}
                            <a href={l.url} target="_blank" rel="noopener noreferrer">
                              {l.title} <ExternalLink size={12} aria-hidden />
                            </a>
                          </span>
                        ))}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
