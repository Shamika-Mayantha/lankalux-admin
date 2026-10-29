import '@/features/pay/pay.css'
import { BRAND } from '@/config/brand'
import { PayButton } from '@/features/pay/PayButton'
import { getPublicPaymentLink } from '@/services/payment-link.service'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ token: string }> }

function money(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency, minimumFractionDigits: 2 }).format(amount)
  } catch {
    return `${currency} ${amount.toFixed(2)}`
  }
}

function tripDates(start: string | null, end: string | null) {
  const fmt = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
  if (start && end) return `${fmt(start)} to ${fmt(end)}`
  return start ? `From ${fmt(start)}` : null
}

export default async function PayPage({ params }: Props) {
  const { token } = await params
  const link = await getPublicPaymentLink(token, { trackOpen: true })

  return (
    <main className="ll-pay">
      <header className="ll-pay-head">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={BRAND.logoSrc} alt="LankaLux" className="ll-pay-logo" />
      </header>

      {!link ? (
        <section className="ll-pay-card">
          <h1>This payment link isn&apos;t available</h1>
          <p className="ll-pay-muted">
            Please contact us at <a href="mailto:hello@lankalux.com">hello@lankalux.com</a> and we&apos;ll send you a new one.
          </p>
        </section>
      ) : (
        <section className="ll-pay-card">
          <p className="ll-pay-eyebrow">{link.client_first_name ? `For ${link.client_first_name}` : 'Your Sri Lanka journey'}</p>
          <h1>{link.label}</h1>
          <p className="ll-pay-amount">{money(link.amount, link.currency)}</p>
          {tripDates(link.start_date, link.end_date) ? <p className="ll-pay-muted">{tripDates(link.start_date, link.end_date)}</p> : null}
          {link.note ? <p className="ll-pay-note">{link.note}</p> : null}

          {link.status === 'paid' ? (
            <div className="ll-pay-state ok">
              <strong>Payment received. Thank you.</strong>
              <span>We look forward to welcoming you to Sri Lanka.</span>
            </div>
          ) : link.status === 'cancelled' || !link.provider_url ? (
            <div className="ll-pay-state">
              <strong>This payment link is no longer active.</strong>
              <span>
                Please contact <a href="mailto:hello@lankalux.com">hello@lankalux.com</a> for an updated link.
              </span>
            </div>
          ) : (
            <PayButton url={link.provider_url} amountLabel={money(link.amount, link.currency)} />
          )}

          {link.journey_url ? (
            <a className="ll-pay-journey" href={link.journey_url}>
              View your journey
            </a>
          ) : null}
        </section>
      )}

      <footer className="ll-pay-foot">
        <p>Payments are processed securely by Revolut. LankaLux never sees or stores your card details.</p>
        <p>
          Questions? <a href="mailto:hello@lankalux.com">hello@lankalux.com</a> · <a href={BRAND.websiteUrl}>lankalux.com</a>
        </p>
      </footer>
    </main>
  )
}
