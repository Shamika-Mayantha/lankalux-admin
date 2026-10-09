'use client'

import { useEffect, useState } from 'react'
import { consoleFetch } from '@/lib/console-api'

type EmailMessage = {
  id: string
  direction: 'outbound' | 'inbound'
  from_address: string | null
  recipient: string | null
  subject: string | null
  body: string | null
  status: string
  error: string | null
  created_at: string
}

/** Email conversation with the client for one request, with a reply box. */
export function EmailThread({ requestId, clientEmail }: { requestId: string; clientEmail: string | null }) {
  const [emails, setEmails] = useState<EmailMessage[] | null>(null)
  const [sendingAs, setSendingAs] = useState('')
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function load() {
    try {
      const json = await consoleFetch(`/api/v2/requests/${encodeURIComponent(requestId)}/emails`)
      setEmails(json.emails || [])
      setSendingAs(json.sendingAs || '')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load emails.')
      setEmails([])
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestId])

  async function send() {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await consoleFetch(`/api/v2/requests/${encodeURIComponent(requestId)}/emails`, {
        method: 'POST',
        body: JSON.stringify({ body: draft }),
      })
      setDraft('')
      setNotice('Email sent.')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Email send failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="ll-thread">
      {error && <div className="ll-error">{error}</div>}
      {emails === null ? <p className="ll-muted">Loading emails…</p> : null}
      {emails && emails.length === 0 ? (
        <p className="ll-muted">No emails yet. Emails sent from this request, and the client&apos;s replies, show up here.</p>
      ) : null}
      {(emails || []).map((m) => (
        <div key={m.id} className={`ll-mail ${m.direction === 'inbound' ? 'in' : 'out'}`}>
          <div className="ll-mail-head">
            <strong>{m.direction === 'inbound' ? m.from_address || 'Client' : m.from_address || 'LankaLux'}</strong>
            <span className="ll-muted">{new Date(m.created_at).toLocaleString()}</span>
          </div>
          {m.subject ? <div className="ll-mail-subject">{m.subject}</div> : null}
          <div className="ll-mail-body">{m.body}</div>
          {m.status === 'failed' ? <div className="ll-error">Not delivered: {m.error || 'unknown error'}</div> : null}
        </div>
      ))}

      <div className="ll-form" style={{ marginTop: 16 }}>
        <label>
          Reply to {clientEmail || 'client'}
          <textarea rows={6} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Write your message…" />
        </label>
        <div className="ll-row">
          <button className="ll-btn" disabled={busy || !draft.trim() || !clientEmail} onClick={send}>
            {busy ? 'Sending…' : 'Send email'}
          </button>
          {sendingAs ? <span className="ll-muted">Sends from {sendingAs}</span> : null}
          {notice ? <span className="ll-ok">{notice}</span> : null}
        </div>
      </div>
    </div>
  )
}
