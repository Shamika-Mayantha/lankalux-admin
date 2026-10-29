'use client'

import { useEffect, useState } from 'react'
import { consoleFetch } from '@/lib/console-api'
import { copyText } from '@/lib/copy-text'

type PaymentLink = {
  token: string
  label: string
  amount: number
  currency: string
  provider_url: string
  note: string
  status: 'open' | 'paid' | 'cancelled'
  first_opened_at: string | null
  paid_at: string | null
  invoice_payment_id: string | null
  created_at: string
  pay_url: string
}

const LABELS = ['Deposit', 'Balance', 'Full payment', 'Extra']
const CURRENCIES = ['GBP', 'EUR', 'USD', 'AUD', 'LKR']

const emptyForm = () => ({ label: 'Deposit', amount: '', currency: 'GBP', provider_url: '', note: '' })

function money(amount: number, currency: string) {
  return `${currency} ${Number(amount).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function when(iso: string | null) {
  return iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''
}

function statusPill(link: PaymentLink) {
  if (link.status === 'paid') return <span className="ll-pill sold">Paid</span>
  if (link.status === 'cancelled') return <span className="ll-pill cancelled">Cancelled</span>
  return <span className="ll-pill follow_up">{link.first_opened_at ? 'Opened' : 'Waiting'}</span>
}

/**
 * Revolut Pro links are made by hand in the Revolut app, then pasted here. Each one gets a branded
 * LankaLux pay page for the client; staff tap Mark paid once Revolut's notification arrives.
 */
export function PaymentLinksPanel({ requestId, onPaid }: { requestId: string; onPaid?: () => void }) {
  const [links, setLinks] = useState<PaymentLink[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(emptyForm)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function load() {
    try {
      const json = await consoleFetch(`/api/v2/requests/${encodeURIComponent(requestId)}/payment-links`)
      setLinks(json.links || [])
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load payment links.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestId])

  async function create() {
    setBusy('create')
    setError(null)
    setNotice(null)
    try {
      const json = await consoleFetch(`/api/v2/requests/${encodeURIComponent(requestId)}/payment-links`, {
        method: 'POST',
        body: JSON.stringify({ ...form, amount: Number(form.amount) }),
      })
      setForm(emptyForm())
      const copied = await copyText(json.link.pay_url)
      setNotice(copied ? 'Pay page ready. Its link is copied, so paste it to the client.' : `Pay page ready: ${json.link.pay_url}`)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the payment link.')
    } finally {
      setBusy(null)
    }
  }

  async function act(link: PaymentLink, action: 'paid' | 'cancel') {
    const question =
      action === 'paid'
        ? `Mark ${link.label.toLowerCase()} of ${money(link.amount, link.currency)} as paid? Check Revolut shows the money first.`
        : `Cancel this ${link.label.toLowerCase()} link? The client's pay page will stop showing the Pay button.`
    if (!window.confirm(question)) return
    setBusy(link.token)
    setError(null)
    setNotice(null)
    try {
      const json = await consoleFetch(`/api/v2/payment-links/${encodeURIComponent(link.token)}`, {
        method: 'PATCH',
        body: JSON.stringify({ action }),
      })
      if (action === 'paid') {
        setNotice(
          json.invoiceRecorded
            ? 'Marked paid and added to the invoice payments.'
            : 'Marked paid. No sent invoice in this currency, so nothing was added to an invoice.'
        )
        onPaid?.()
      } else {
        setNotice('Link cancelled.')
      }
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update the link.')
    } finally {
      setBusy(null)
    }
  }

  async function copy(link: PaymentLink) {
    const ok = await copyText(link.pay_url)
    setNotice(ok ? 'Pay page link copied.' : link.pay_url)
  }

  const canCreate = Number(form.amount) > 0 && form.provider_url.trim().length > 0 && !busy

  return (
    <section className="ll-card" style={{ marginBottom: 20 }} aria-labelledby="ll-paylinks-title">
      <h3 id="ll-paylinks-title" style={{ marginTop: 0 }}>Revolut payment links</h3>
      <p className="ll-muted" style={{ marginTop: 0 }}>
        Make the link in the Revolut app, paste it here, and send the client the LankaLux pay page. Tap Mark paid when Revolut tells
        you the money arrived.
      </p>

      <div className="ll-form" style={{ maxWidth: 'none' }}>
        <div className="ll-fields-2">
          <label>
            For
            <select value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })}>
              {LABELS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <div className="ll-fields-2">
            <label>
              Amount
              <input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                placeholder="500"
              />
            </label>
            <label>
              Currency
              <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
        <label>
          Revolut link
          <input
            type="url"
            value={form.provider_url}
            onChange={(e) => setForm({ ...form, provider_url: e.target.value })}
            placeholder="https://checkout.revolut.com/pay/…"
          />
        </label>
        <label>
          Note for the client (optional)
          <input
            value={form.note}
            maxLength={500}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
            placeholder="Secures your dates. The balance is due 30 days before arrival."
          />
        </label>
        <div className="ll-row">
          <button className="ll-btn" disabled={!canCreate} onClick={() => void create()}>
            {busy === 'create' ? 'Creating…' : 'Create pay page'}
          </button>
        </div>
        <p className="ll-muted" style={{ margin: 0, fontSize: 13 }}>
          Make sure the amount matches the Revolut link exactly. The client sees this amount on the LankaLux page.
        </p>
      </div>

      {error ? <div className="ll-error">{error}</div> : null}
      {notice ? <div className="ll-ok">{notice}</div> : null}

      {loading ? (
        <p className="ll-muted">Loading payment links…</p>
      ) : links.length === 0 ? null : (
        <div style={{ overflow: 'auto', marginTop: 16 }}>
          <table className="ll-table">
            <thead>
              <tr>
                <th>For</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Activity</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {links.map((link) => (
                <tr key={link.token}>
                  <td>{link.label}</td>
                  <td>{money(link.amount, link.currency)}</td>
                  <td>{statusPill(link)}</td>
                  <td className="ll-muted" style={{ fontSize: 13 }}>
                    {link.status === 'paid'
                      ? `Paid ${when(link.paid_at)}${link.invoice_payment_id ? ' · on invoice' : ''}`
                      : link.first_opened_at
                        ? `Client opened ${when(link.first_opened_at)}`
                        : `Created ${when(link.created_at)}`}
                  </td>
                  <td>
                    <div className="ll-row" style={{ gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      <button className="ll-btn ghost" onClick={() => void copy(link)}>
                        Copy link
                      </button>
                      <a className="ll-btn ghost" href={link.pay_url} target="_blank" rel="noreferrer">
                        Preview
                      </a>
                      {link.status === 'open' ? (
                        <>
                          <button className="ll-btn" disabled={!!busy} onClick={() => void act(link, 'paid')}>
                            Mark paid
                          </button>
                          <button className="ll-btn secondary" disabled={!!busy} onClick={() => void act(link, 'cancel')}>
                            Cancel
                          </button>
                        </>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
