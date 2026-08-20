'use client'

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

export function InvoicePreview({ model, className = '' }: { model: InvoicePreviewModel; className?: string }) {
  return (
    <div className={`rounded-2xl border border-theme bg-[#F9F4EB] text-[#252523] shadow-card overflow-hidden ${className}`}>
      <div className="px-6 py-5 border-b border-[#d9d2c5] bg-[#F9F4EB]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-[#B18544] font-semibold">LankaLux</p>
            <h3 className="text-2xl font-semibold text-[#1A2A1D] mt-1">Invoice</h3>
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold text-[#1A2A1D]">{model.invoiceNumber}</p>
            <p className="text-xs text-[#6B6B66]">{model.formatted.invoiceDate}</p>
          </div>
        </div>
      </div>

      <div className="px-6 py-5 space-y-5 text-sm">
        <section className="grid md:grid-cols-2 gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.12em] text-[#B18544] font-semibold mb-2">Billed to</p>
            <p className="text-base font-semibold text-[#1A2A1D]">{model.client.name}</p>
            {model.client.country && <p className="text-[#6B6B66]">{model.client.country}</p>}
            <p className="text-[#6B6B66] mt-1">
              {model.client.adults} adults
              {model.client.children > 0 ? ` · ${model.client.children} children` : ''}
            </p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-[0.12em] text-[#B18544] font-semibold mb-2">Travel dates</p>
            <p className="text-[#1A2A1D]">{model.formatted.travelStart} - {model.formatted.travelEnd}</p>
            <p className="text-[#6B6B66] mt-1">Payment due: {model.formatted.dueDate}</p>
          </div>
        </section>

        <section className="pt-4 border-t border-[#d9d2c5]">
          <p className="text-[11px] uppercase tracking-[0.12em] text-[#B18544] font-semibold mb-2">Your journey</p>
          <p className="text-base font-semibold text-[#1A2A1D]">{model.journey.title}</p>
          <p className="text-[#6B6B66]">{model.journey.days} Days / {model.journey.nights} Nights</p>
          {model.journey.destinations.length > 0 && (
            <p className="text-[#252523] mt-1">{model.journey.destinations.join(' · ')}</p>
          )}
          {model.journey.summary && <p className="text-[#6B6B66] mt-2">{model.journey.summary}</p>}
        </section>

        <section className="grid md:grid-cols-2 gap-4 pt-4 border-t border-[#d9d2c5]">
          <div>
            <p className="text-[11px] uppercase tracking-[0.12em] text-[#B18544] font-semibold mb-2">Your vehicle</p>
            <p className="font-semibold text-[#1A2A1D]">{model.vehicle.name || 'Not specified'}</p>
            {model.vehicle.description && <p className="text-[#6B6B66]">{model.vehicle.description}</p>}
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-[0.12em] text-[#B18544] font-semibold mb-2">Your Chauffeur-Guide</p>
            <p className="font-semibold text-[#1A2A1D]">{model.chauffeurGuide.name || 'To be confirmed'}</p>
            <p className="text-[#6B6B66]">{model.chauffeurGuide.role}</p>
          </div>
        </section>

        <section className="pt-4 border-t border-[#d9d2c5]">
          <div className="flex items-start justify-between gap-4">
            <p className="text-[#252523]">{model.packageDescription}</p>
            <p className="font-semibold text-[#1A2A1D]">{model.formatted.packageTotal}</p>
          </div>
          <div className="mt-3 space-y-1 text-sm">
            <div className="flex justify-between text-[#6B6B66]"><span>Total paid</span><span>{model.formatted.totalPaid}</span></div>
            <div className="flex justify-between font-semibold text-[#1A2A1D]"><span>Balance due</span><span>{model.formatted.balanceDue}</span></div>
          </div>
        </section>

        {model.payments.length > 0 && (
          <section className="pt-4 border-t border-[#d9d2c5]">
            <p className="text-[11px] uppercase tracking-[0.12em] text-[#B18544] font-semibold mb-2">Payments received</p>
            <div className="space-y-2">
              {model.payments.map((p) => (
                <div key={p.id} className="flex justify-between gap-4 text-[#6B6B66]">
                  <span>{p.date} · {p.method}{p.reference ? ` · ${p.reference}` : ''}</span>
                  <span>{p.currency} {p.amount.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
