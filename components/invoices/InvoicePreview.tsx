'use client'

import { BRAND } from '@/config/brand'
import './invoice.css'

export type InvoicePreviewModel = {
  invoiceId: string
  invoiceNumber: string
  invoiceDate: string
  dueDate: string | null
  status: string
  paymentStatus: string
  currency: string
  packageDescription: string
  packageTotal: number
  totalPaid: number
  balanceDue: number
  client: {
    name: string
    additionalNames: string[]
    email: string | null
    phone: string | null
    country: string | null
    adults: number
    children: number
    childrenAges: number[]
  }
  travelDates: { start: string | null; end: string | null }
  journey: {
    title: string
    days: number
    nights: number
    destinations: string[]
    summary: string
    secureLink: string | null
  }
  vehicle: {
    name: string | null
    category: string | null
    description: string | null
    passengerCapacity: number | null
    registrationNumber: string | null
    image: string | null
  }
  chauffeurGuide: {
    name: string | null
    role: string
    languages: string[]
    phone: string | null
    image?: string | null
  }
  payments: Array<{
    id: string
    date: string
    method: string
    reference: string | null
    amount: number
    currency: string
    note: string | null
  }>
  paymentInstructions: {
    beneficiaryName: string | null
    bankName: string | null
    accountNumber: string | null
    branchName: string | null
    swiftCode: string | null
    iban: string | null
    paymentReferenceNote: string | null
    instructionsNote: string | null
    visibleFields: Record<string, boolean>
  }
  clientNote: string | null
  included: string[]
  formatted: {
    invoiceDate: string
    dueDate: string
    travelStart: string
    travelEnd: string
    packageTotal: string
    totalPaid: string
    balanceDue: string
  }
}

function instructionLines(model: InvoicePreviewModel) {
  const i = model.paymentInstructions
  return [
    i.beneficiaryName ? `Beneficiary: ${i.beneficiaryName}` : '',
    i.bankName ? `Bank: ${i.bankName}` : '',
    i.accountNumber ? `Account: ${i.accountNumber}` : '',
    i.branchName ? `Branch: ${i.branchName}` : '',
    i.swiftCode ? `SWIFT: ${i.swiftCode}` : '',
    i.iban ? `IBAN: ${i.iban}` : '',
    i.paymentReferenceNote || '',
    i.instructionsNote || '',
  ].filter(Boolean)
}

export function InvoicePreview({ model, className = '' }: { model: InvoicePreviewModel; className?: string }) {
  const party = [
    model.client.adults ? `${model.client.adults} adult${model.client.adults === 1 ? '' : 's'}` : '',
    model.client.children ? `${model.client.children} child${model.client.children === 1 ? '' : 'ren'}` : '',
  ]
    .filter(Boolean)
    .join(' · ')
  const instructions = instructionLines(model)

  return (
    <article className={`ll-invoice ${className}`}>
      <header className="ll-invoice-top">
        <img src={BRAND.logoSrc} alt="LankaLux" className="ll-invoice-logo" />
        <div className="ll-invoice-meta">
          <p className="ll-invoice-kicker">Invoice</p>
          <p className="ll-invoice-number">{model.invoiceNumber}</p>
          <p className="ll-invoice-muted">{model.formatted.invoiceDate}</p>
        </div>
      </header>

      <section className="ll-invoice-split">
        <div>
          <p className="ll-invoice-label">Billed to</p>
          <p className="ll-invoice-title">{model.client.name}</p>
          {model.client.country ? <p className="ll-invoice-muted">{model.client.country}</p> : null}
          {model.client.additionalNames.length ? (
            <p className="ll-invoice-muted">{model.client.additionalNames.join(', ')}</p>
          ) : null}
          {party ? <p className="ll-invoice-muted">{party}</p> : null}
        </div>
        <div>
          <p className="ll-invoice-label">Travel dates</p>
          <p className="ll-invoice-body">
            {model.formatted.travelStart} – {model.formatted.travelEnd}
          </p>
        </div>
      </section>

      <section>
        <p className="ll-invoice-label">Your journey</p>
        <p className="ll-invoice-title">{model.journey.title}</p>
        <p className="ll-invoice-muted">
          {model.formatted.travelStart} – {model.formatted.travelEnd}
        </p>
        {model.journey.days ? (
          <p className="ll-invoice-muted">
            {model.journey.days} Days / {model.journey.nights} Nights
          </p>
        ) : null}
        {model.journey.destinations.length ? (
          <p className="ll-invoice-body">{model.journey.destinations.join(' · ')}</p>
        ) : null}
        {model.journey.summary ? <p className="ll-invoice-muted">{model.journey.summary}</p> : null}
      </section>

      <section className="ll-invoice-split">
        <div>
          <p className="ll-invoice-label">Your vehicle</p>
          {model.vehicle.image ? <img src={model.vehicle.image} alt="" className="ll-invoice-thumb" /> : null}
          <p className="ll-invoice-title">{model.vehicle.name || 'To be confirmed'}</p>
          {model.vehicle.description ? <p className="ll-invoice-muted">{model.vehicle.description}</p> : null}
          {model.vehicle.passengerCapacity ? (
            <p className="ll-invoice-muted">{model.vehicle.passengerCapacity} passengers</p>
          ) : null}
          {model.vehicle.registrationNumber ? (
            <p className="ll-invoice-muted">{model.vehicle.registrationNumber}</p>
          ) : null}
        </div>
        <div>
          <p className="ll-invoice-label">Your Chauffeur-Guide</p>
          {model.chauffeurGuide.image ? <img src={model.chauffeurGuide.image} alt="" className="ll-invoice-thumb round" /> : null}
          <p className="ll-invoice-title">{model.chauffeurGuide.name || 'To be confirmed'}</p>
          <p className="ll-invoice-muted">{model.chauffeurGuide.role}</p>
          {model.chauffeurGuide.languages.length ? (
            <p className="ll-invoice-muted">{model.chauffeurGuide.languages.join(', ')}</p>
          ) : null}
        </div>
      </section>

      <section>
        <p className="ll-invoice-label">Package</p>
        <div className="ll-invoice-row">
          <span>{model.packageDescription}</span>
          <strong>{model.formatted.packageTotal}</strong>
        </div>
        <p className="ll-invoice-label" style={{ marginTop: 18 }}>
          Payments received
        </p>
        {model.payments.length ? (
          model.payments.map((payment) => (
            <div className="ll-invoice-row muted" key={payment.id}>
              <span>
                {payment.date} — {payment.method}
                {payment.reference ? ` · ${payment.reference}` : ''}
              </span>
              <span>
                {payment.currency} {payment.amount.toFixed(2)}
              </span>
            </div>
          ))
        ) : (
          <p className="ll-invoice-muted">No payments recorded yet.</p>
        )}
        <div className="ll-invoice-row">
          <span>Total paid</span>
          <span>{model.formatted.totalPaid}</span>
        </div>
        <div className="ll-invoice-row strong">
          <span>Balance due</span>
          <strong>{model.formatted.balanceDue}</strong>
        </div>
        <p className="ll-invoice-muted">Payment due: {model.formatted.dueDate}</p>
      </section>

      <section>
        <p className="ll-invoice-label">Included</p>
        <ul className="ll-invoice-list">
          {model.included.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      {instructions.length ? (
        <section>
          <p className="ll-invoice-label">Payment instructions</p>
          {instructions.map((line) => (
            <p className="ll-invoice-muted" key={line}>
              {line}
            </p>
          ))}
        </section>
      ) : null}

      {model.clientNote ? <p className="ll-invoice-muted">{model.clientNote}</p> : null}

      {model.journey.secureLink ? (
        <section>
          <p className="ll-invoice-label">View your complete LankaLux journey</p>
          <a className="ll-invoice-link" href={model.journey.secureLink} target="_blank" rel="noreferrer">
            View Full Journey
          </a>
        </section>
      ) : null}

      <footer className="ll-invoice-foot">
        <p>Thank you for choosing LankaLux.</p>
        <p>LankaLux · Bespoke Journeys across Sri Lanka</p>
      </footer>
    </article>
  )
}
