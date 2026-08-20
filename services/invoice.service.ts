import { randomBytes } from 'crypto'
import { appUrl } from '@/config/env'
import { logActivity } from '@/services/activity.service'
import { listVehicles } from '@/services/catalog.service'
import {
  amount,
  calculateTotals,
  invoiceStatus,
  parseClientFacingPrice,
  paymentStatus,
  uniqueInOrder,
  VEHICLE_ID_ALIASES,
  normalizeVehicleLookup,
} from '@/services/invoice-math'
import { listItineraries } from '@/services/itinerary.service'
import { getRequest, parseChildrenAges } from '@/services/request.service'
import { createShareLink } from '@/services/share.service'
import { getServiceClient, isMissingTableError } from '@/services/supabase.server'
import type {
  ClientRequestRow,
  InvoicePaymentMethod,
  InvoicePaymentRecord,
  InvoicePaymentStatus,
  InvoiceRecord,
  InvoiceStatus,
  ItineraryRecord,
  VehicleRecord,
} from '@/types/domain'

const PAYMENT_METHODS: InvoicePaymentMethod[] = ['bank_transfer', 'card', 'cash', 'online_payment', 'other']
const DEFAULT_CLIENT_NOTE =
  'Thank you for choosing LankaLux. Please quote your invoice number when making payment.'
const INVOICE_INCLUDED = [
  'Private chauffeur-guide and dedicated vehicle throughout the journey',
  'Airport meet and greet on arrival',
  'Personalised day-by-day itinerary',
  '24/7 LankaLux journey support',
]

type InvoiceSettingsRow = {
  beneficiary_name: string | null
  bank_name: string | null
  account_number: string | null
  branch_name: string | null
  swift_code: string | null
  iban: string | null
  payment_reference_note: string | null
  instructions_note: string | null
  show_vehicle_registration: boolean
  default_client_note: string | null
  visible_fields: Record<string, boolean>
}

type InvoiceTotals = {
  total: number
  paid: number
  balance: number
}

type InvoiceBundle = {
  invoice: InvoiceRecord
  payments: InvoicePaymentRecord[]
  totals: InvoiceTotals
  payment_status: InvoicePaymentStatus
}

export type PaymentInput = {
  amount: number
  currency: string
  payment_date: string
  payment_method: InvoicePaymentMethod
  reference_number?: string | null
  note?: string | null
}

type InvoiceDraftPatch = Partial<{
  invoice_date: string
  due_date: string | null
  currency: string
  package_total: number
  package_description: string
  client_note: string | null
  secure_journey_url: string | null
  payment_instructions: Record<string, unknown>
}>

function serverSupabase() {
  return getServiceClient()
}

function defaultVisibleFields() {
  return {
    beneficiary_name: true,
    bank_name: true,
    account_number: true,
    branch_name: true,
    swift_code: true,
    iban: false,
  }
}

function visibleValue(source: Record<string, unknown>, key: string, visible: Record<string, boolean>): string | null {
  if (visible[key] === false) return null
  const value = source[key]
  return value ? String(value) : null
}

function visiblePaymentInstructions(paymentInstructions: Record<string, unknown>) {
  const visible = safeParseJson<Record<string, boolean>>(paymentInstructions.visible_fields, defaultVisibleFields())
  return {
    beneficiaryName: visibleValue(paymentInstructions, 'beneficiary_name', visible),
    bankName: visibleValue(paymentInstructions, 'bank_name', visible),
    accountNumber: visibleValue(paymentInstructions, 'account_number', visible),
    branchName: visibleValue(paymentInstructions, 'branch_name', visible),
    swiftCode: visibleValue(paymentInstructions, 'swift_code', visible),
    iban: visibleValue(paymentInstructions, 'iban', visible),
    paymentReferenceNote: paymentInstructions.payment_reference_note ? String(paymentInstructions.payment_reference_note) : null,
    instructionsNote: paymentInstructions.instructions_note ? String(paymentInstructions.instructions_note) : null,
    visibleFields: visible,
  }
}

function safeParseJson<T>(raw: unknown, fallback: T): T {
  if (raw == null) return fallback
  if (typeof raw === 'object') return raw as T
  if (typeof raw !== 'string') return fallback
  try {
    const parsed = JSON.parse(raw)
    return (parsed as T) ?? fallback
  } catch {
    return fallback
  }
}

function asIsoDate(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  const trimmed = value.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null
  const dt = new Date(`${trimmed}T00:00:00`)
  if (Number.isNaN(dt.getTime())) return null
  return trimmed
}

function humanPaymentMethod(method: InvoicePaymentMethod): string {
  switch (method) {
    case 'bank_transfer':
      return 'Bank Transfer'
    case 'card':
      return 'Card'
    case 'cash':
      return 'Cash'
    case 'online_payment':
      return 'Online Payment'
    default:
      return 'Other'
  }
}

function formatMoney(amountValue: number, currency: string): string {
  const code = String(currency || 'USD').toUpperCase()
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: code,
      currencyDisplay: 'code',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amountValue)
  } catch {
    return `${code} ${amountValue.toFixed(2)}`
  }
}

function formatDateLabel(isoDate: string | null | undefined): string {
  if (!isoDate) return 'Not specified'
  const parsed = new Date(`${isoDate}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return String(isoDate)
  return parsed.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function selectedItineraryForInvoice(itineraries: ItineraryRecord[]): ItineraryRecord {
  const selected = itineraries.find((row) => row.is_selected)
  if (!selected || !selected.payload?.days?.length) {
    throw new Error('Select and confirm an itinerary before creating an invoice.')
  }
  return selected
}

function matchVehicle(vehicles: VehicleRecord[], value: string | null | undefined): VehicleRecord | null {
  const lookup = normalizeVehicleLookup(value)
  if (!lookup) return null
  const aliased = VEHICLE_ID_ALIASES[lookup] || lookup
  return (
    vehicles.find((v) => v.id.toLowerCase() === aliased) ||
    vehicles.find((v) => v.name.trim().toLowerCase() === lookup) ||
    vehicles.find((v) => v.name.trim().toLowerCase() === aliased) ||
    null
  )
}

async function latestShareToken(requestId: string): Promise<string | null> {
  const sb = serverSupabase()
  const { data, error } = await sb
    .from('share_links')
    .select('token')
    .eq('request_id', requestId)
    .is('revoked_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error && !isMissingTableError(error)) return null
  return data?.token ? String(data.token) : null
}

async function resolveJourneyLink(requestId: string, actor?: string): Promise<{ token: string | null; url: string | null }> {
  const existing = await latestShareToken(requestId)
  if (existing) return { token: existing, url: `${appUrl()}/journey/${existing}` }
  try {
    const share = await createShareLink({ requestId, actor })
    return { token: share.token, url: share.url }
  } catch {
    return { token: null, url: null }
  }
}

async function resolveVehicle(
  request: ClientRequestRow,
  itinerary: ItineraryRecord
): Promise<VehicleRecord | null> {
  const vehicles = await listVehicles()
  return (
    matchVehicle(vehicles, itinerary.vehicle_id) ||
    matchVehicle(vehicles, itinerary.payload.vehicle_id) ||
    matchVehicle(vehicles, request.vehicle_preference) ||
    null
  )
}

function destinationSummary(itinerary: ItineraryRecord): string[] {
  return uniqueInOrder(
    (itinerary.payload.days || []).map((day) => day.overnight_location || day.location)
  )
}

function toInvoiceRecord(row: Record<string, unknown>): InvoiceRecord {
  return {
    id: String(row.id || ''),
    request_id: String(row.request_id || ''),
    selected_itinerary_id: (row.selected_itinerary_id as string) || null,
    vehicle_id: (row.vehicle_id as string) || null,
    chauffeur_guide_id: (row.chauffeur_guide_id as string) || null,
    share_link_token: (row.share_link_token as string) || null,
    revision_of: (row.revision_of as string) || null,
    invoice_number: String(row.invoice_number || ''),
    status: (row.status as InvoiceStatus) || 'draft',
    payment_status: (row.payment_status as InvoicePaymentStatus) || 'unpaid',
    invoice_date: String(row.invoice_date || ''),
    due_date: (row.due_date as string) || null,
    currency: String(row.currency || 'USD'),
    package_total: amount(row.package_total),
    package_description: String(row.package_description || 'LankaLux Sri Lanka Journey'),
    client_note: (row.client_note as string) || null,
    payment_instructions: safeParseJson<Record<string, unknown>>(row.payment_instructions, {}),
    client_snapshot: safeParseJson<Record<string, unknown>>(row.client_snapshot, {}),
    journey_snapshot: safeParseJson<Record<string, unknown>>(row.journey_snapshot, {}),
    vehicle_snapshot: safeParseJson<Record<string, unknown>>(row.vehicle_snapshot, {}),
    chauffeur_snapshot: safeParseJson<Record<string, unknown>>(row.chauffeur_snapshot, {}),
    totals_snapshot: safeParseJson<Record<string, unknown>>(row.totals_snapshot, {}),
    secure_journey_url: (row.secure_journey_url as string) || null,
    finalized_at: (row.finalized_at as string) || null,
    finalized_by: (row.finalized_by as string) || null,
    sent_at: (row.sent_at as string) || null,
    sent_by: (row.sent_by as string) || null,
    cancelled_at: (row.cancelled_at as string) || null,
    cancelled_by: (row.cancelled_by as string) || null,
    created_by: (row.created_by as string) || null,
    updated_by: (row.updated_by as string) || null,
    created_at: String(row.created_at || ''),
    updated_at: String(row.updated_at || ''),
  }
}

function toPaymentRecord(row: Record<string, unknown>): InvoicePaymentRecord {
  const method = String(row.payment_method || 'other') as InvoicePaymentMethod
  return {
    id: String(row.id || ''),
    invoice_id: String(row.invoice_id || ''),
    amount: amount(row.amount),
    currency: String(row.currency || 'USD'),
    payment_date: String(row.payment_date || ''),
    payment_method: PAYMENT_METHODS.includes(method) ? method : 'other',
    reference_number: (row.reference_number as string) || null,
    note: (row.note as string) || null,
    status: row.status === 'void' ? 'void' : 'successful',
    created_by: (row.created_by as string) || null,
    updated_by: (row.updated_by as string) || null,
    created_at: String(row.created_at || ''),
    updated_at: String(row.updated_at || ''),
  }
}

function summarize(invoice: InvoiceRecord, payments: InvoicePaymentRecord[]): InvoiceBundle {
  const totals = calculateTotals(invoice.package_total, payments, invoice.currency)
  const payment = paymentStatus(totals.total, totals.paid, invoice.due_date)
  return {
    invoice: {
      ...invoice,
      payment_status: payment,
      status: invoiceStatus(invoice.status, payment),
    },
    payments,
    totals,
    payment_status: payment,
  }
}

async function appendActivity(requestId: string, eventType: string, detail: Record<string, unknown>, actor?: string | null) {
  await logActivity({
    request_id: requestId,
    actor: actor || null,
    event_type: eventType,
    detail,
  })
}

async function getInvoiceRow(invoiceId: string): Promise<InvoiceRecord> {
  const sb = serverSupabase()
  const { data, error } = await sb.from('invoices').select('*').eq('id', invoiceId).single()
  if (error || !data) {
    if (error && isMissingTableError(error)) {
      throw new Error('Invoices table is missing. Run supabase/migrations/20260820000000_invoices_and_payments.sql in the Supabase SQL editor.')
    }
    throw new Error('Invoice not found.')
  }
  return toInvoiceRecord(data as Record<string, unknown>)
}

function emptySettings(): InvoiceSettingsRow {
  return {
    beneficiary_name: null,
    bank_name: null,
    account_number: null,
    branch_name: null,
    swift_code: null,
    iban: null,
    payment_reference_note: null,
    instructions_note: null,
    show_vehicle_registration: false,
    default_client_note: DEFAULT_CLIENT_NOTE,
    visible_fields: defaultVisibleFields(),
  }
}

export async function getInvoiceSettings(): Promise<InvoiceSettingsRow> {
  const sb = serverSupabase()
  const { data, error } = await sb.from('invoice_settings').select('*').eq('id', 1).maybeSingle()
  if (error || !data) return emptySettings()
  return {
    beneficiary_name: (data.beneficiary_name as string) || null,
    bank_name: (data.bank_name as string) || null,
    account_number: (data.account_number as string) || null,
    branch_name: (data.branch_name as string) || null,
    swift_code: (data.swift_code as string) || null,
    iban: (data.iban as string) || null,
    payment_reference_note: (data.payment_reference_note as string) || null,
    instructions_note: (data.instructions_note as string) || null,
    show_vehicle_registration: data.show_vehicle_registration === true,
    default_client_note: (data.default_client_note as string) || DEFAULT_CLIENT_NOTE,
    visible_fields: safeParseJson<Record<string, boolean>>(data.visible_fields, defaultVisibleFields()),
  }
}

export async function saveInvoiceSettings(patch: Partial<InvoiceSettingsRow>, actor?: string): Promise<InvoiceSettingsRow> {
  const current = await getInvoiceSettings()
  const next: InvoiceSettingsRow = {
    ...current,
    ...patch,
    visible_fields: patch.visible_fields ? { ...current.visible_fields, ...patch.visible_fields } : current.visible_fields,
  }
  const sb = serverSupabase()
  const { error } = await sb.from('invoice_settings').upsert({
    id: 1,
    ...next,
    updated_by: actor || null,
    updated_at: new Date().toISOString(),
  })
  if (error) throw new Error(error.message)
  return getInvoiceSettings()
}

function buildSnapshots(opts: {
  request: ClientRequestRow
  itinerary: ItineraryRecord
  journeyUrl: string | null
  vehicle: VehicleRecord | null
  settings: InvoiceSettingsRow
}) {
  const { request, itinerary, journeyUrl, vehicle, settings } = opts
  const destinations = destinationSummary(itinerary)
  const days = request.duration || itinerary.payload.days.length || 0
  const nights = Math.max(days - 1, 0)
  const title = itinerary.payload.title || itinerary.title || 'LankaLux Journey'
  const summary = itinerary.payload.summary || itinerary.summary || 'Private LankaLux journey across Sri Lanka.'
  return {
    clientSnapshot: {
      lead_traveller_name: request.client_name || 'Guest',
      additional_traveller_names: null as string[] | null,
      email: request.email || null,
      phone_whatsapp: request.whatsapp || null,
      country: request.origin_country || null,
      adults: request.number_of_adults || 0,
      children: request.number_of_children || 0,
      children_ages: parseChildrenAges(request.children_ages),
      arrival_date: request.start_date || null,
      departure_date: request.end_date || null,
    },
    journeySnapshot: {
      title,
      arrival_date: request.start_date || null,
      departure_date: request.end_date || null,
      days,
      nights,
      destinations,
      summary,
      secure_journey_link: journeyUrl,
    },
    vehicleSnapshot: vehicle
      ? {
          id: vehicle.id,
          name: vehicle.name,
          category: vehicle.type || vehicle.name,
          passenger_capacity: vehicle.passenger_capacity,
          description: vehicle.description,
          registration_number: settings.show_vehicle_registration ? null : null,
          image: vehicle.photos?.[0] || null,
        }
      : {},
    chauffeurSnapshot: {
      id: request.assigned_employee || null,
      name: request.assigned_employee || null,
      role: request.assigned_employee ? 'LankaLux Chauffeur-Guide' : null,
      languages: null,
      phone: null,
      image: null,
    },
  }
}

export async function listInvoicePayments(invoiceId: string): Promise<InvoicePaymentRecord[]> {
  const sb = serverSupabase()
  const { data, error } = await sb
    .from('invoice_payments')
    .select('*')
    .eq('invoice_id', invoiceId)
    .order('payment_date', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data || []).map((row) => toPaymentRecord(row as Record<string, unknown>))
}

export async function getInvoice(invoiceId: string): Promise<InvoiceBundle> {
  const invoice = await getInvoiceRow(invoiceId)
  const payments = await listInvoicePayments(invoiceId)
  return summarize(invoice, payments)
}

async function persistDerived(bundle: InvoiceBundle, actor?: string) {
  const sb = serverSupabase()
  const { error } = await sb
    .from('invoices')
    .update({
      status: bundle.invoice.status,
      payment_status: bundle.payment_status,
      totals_snapshot: bundle.totals,
      updated_by: actor || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', bundle.invoice.id)
  if (error) throw new Error(error.message)
  if (bundle.payment_status === 'paid') {
    await appendActivity(bundle.invoice.request_id, 'invoice_marked_paid', {
      invoice_id: bundle.invoice.id,
      invoice_number: bundle.invoice.invoice_number,
    }, actor)
  }
}

export async function listInvoices(opts?: { requestId?: string }): Promise<InvoiceBundle[]> {
  const sb = serverSupabase()
  let query = sb.from('invoices').select('*').order('created_at', { ascending: false }).limit(300)
  if (opts?.requestId) query = query.eq('request_id', opts.requestId)
  const { data, error } = await query
  if (error) {
    if (isMissingTableError(error)) return []
    throw new Error(error.message)
  }
  const invoices = (data || []).map((row) => toInvoiceRecord(row as Record<string, unknown>))
  if (!invoices.length) return []

  const ids = invoices.map((x) => x.id)
  const { data: payRows, error: payError } = await sb.from('invoice_payments').select('*').in('invoice_id', ids)
  if (payError) throw new Error(payError.message)
  const payments = (payRows || []).map((row) => toPaymentRecord(row as Record<string, unknown>))
  const byInvoice = new Map<string, InvoicePaymentRecord[]>()
  for (const payment of payments) byInvoice.set(payment.invoice_id, [...(byInvoice.get(payment.invoice_id) || []), payment])
  return invoices.map((invoice) => summarize(invoice, byInvoice.get(invoice.id) || []))
}

export async function previewInvoiceSource(requestId: string) {
  const request = await getRequest(requestId)
  const client = {
    name: request.client_name || 'Guest',
    email: request.email || null,
    phone: request.whatsapp || null,
    country: request.origin_country || null,
    adults: request.number_of_adults || 0,
    children: request.number_of_children || 0,
    childrenAges: parseChildrenAges(request.children_ages),
    arrival_date: request.start_date || null,
    departure_date: request.end_date || null,
  }
  const chauffeurGuide = {
    name: request.assigned_employee || null,
    role: 'LankaLux Chauffeur-Guide',
  }
  try {
    const itinerary = selectedItineraryForInvoice(await listItineraries(requestId))
    const vehicle = await resolveVehicle(request, itinerary)
    const token = await latestShareToken(requestId)
    const journeyUrl = token ? `${appUrl()}/journey/${token}` : null
    const settings = await getInvoiceSettings()
    const snapshots = buildSnapshots({
      request,
      itinerary,
      journeyUrl,
      vehicle,
      settings,
    })
    const quoted = parseClientFacingPrice(itinerary.payload.price || request.budget)
    const budgetQuote = parseClientFacingPrice(request.budget)
    return {
      ready: true,
      reason: null as string | null,
      client,
      journey: snapshots.journeySnapshot,
      vehicle: snapshots.vehicleSnapshot,
      chauffeurGuide,
      currency: quoted.amount ? quoted.currency : budgetQuote.currency || 'USD',
      packageTotal: quoted.amount || budgetQuote.amount,
      packageDescription: 'LankaLux Sri Lanka Journey',
    }
  } catch (error) {
    return {
      ready: false,
      reason: error instanceof Error ? error.message : 'Select an itinerary before creating an invoice.',
      client,
      journey: null as null,
      vehicle: null as null,
      chauffeurGuide,
      currency: 'USD',
      packageTotal: 0,
      packageDescription: 'LankaLux Sri Lanka Journey',
    }
  }
}

async function gatherLiveInvoiceSource(requestId: string, actor?: string) {
  const request = await getRequest(requestId)
  const itinerary = selectedItineraryForInvoice(await listItineraries(requestId))
  const vehicle = await resolveVehicle(request, itinerary)
  const settings = await getInvoiceSettings()
  const journey = await resolveJourneyLink(requestId, actor)
  const snapshots = buildSnapshots({
    request,
    itinerary,
    journeyUrl: journey.url,
    vehicle,
    settings,
  })
  const quoted = parseClientFacingPrice(itinerary.payload.price || request.budget)
  const budgetQuote = parseClientFacingPrice(request.budget)
  const packageTotal = quoted.amount || budgetQuote.amount
  const currency = quoted.amount ? quoted.currency : budgetQuote.currency || 'USD'
  return {
    request,
    itinerary,
    vehicle,
    settings,
    journey,
    snapshots,
    packageTotal,
    currency,
  }
}

export async function createInvoiceFromRequest(requestId: string, actor?: string): Promise<InvoiceBundle> {
  const source = await gatherLiveInvoiceSource(requestId, actor)
  const invoiceDate = new Date().toISOString().slice(0, 10)
  const dueDate = source.request.start_date || new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
  const sb = serverSupabase()
  const { data, error } = await sb
    .from('invoices')
    .insert({
      request_id: requestId,
      selected_itinerary_id: source.itinerary.id.startsWith('placeholder-') || source.itinerary.id.startsWith('legacy-')
        ? String(source.itinerary.option_number)
        : source.itinerary.id,
      vehicle_id: source.vehicle?.id || null,
      chauffeur_guide_id: source.request.assigned_employee || null,
      share_link_token: source.journey.token,
      status: 'draft',
      payment_status: 'unpaid',
      invoice_date: invoiceDate,
      due_date: dueDate,
      currency: source.currency,
      package_total: source.packageTotal,
      package_description: 'LankaLux Sri Lanka Journey',
      client_note: source.settings.default_client_note || DEFAULT_CLIENT_NOTE,
      payment_instructions: source.settings,
      client_snapshot: source.snapshots.clientSnapshot,
      journey_snapshot: source.snapshots.journeySnapshot,
      vehicle_snapshot: source.snapshots.vehicleSnapshot,
      chauffeur_snapshot: source.snapshots.chauffeurSnapshot,
      totals_snapshot: { total: source.packageTotal, paid: 0, balance: source.packageTotal },
      secure_journey_url: source.journey.url,
      created_by: actor || null,
      updated_by: actor || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select('*')
    .single()
  if (error || !data) {
    if (error && isMissingTableError(error)) {
      throw new Error('Invoices table is missing. Run supabase/migrations/20260820000000_invoices_and_payments.sql in the Supabase SQL editor.')
    }
    throw new Error(error?.message || 'Failed to create invoice.')
  }

  const invoice = toInvoiceRecord(data as Record<string, unknown>)
  await appendActivity(requestId, 'invoice_created', { invoice_id: invoice.id, invoice_number: invoice.invoice_number }, actor)
  return summarize(invoice, [])
}

function normalizeDraftPatch(patch: InvoiceDraftPatch): Record<string, unknown> {
  const next: Record<string, unknown> = {}
  if (patch.invoice_date !== undefined) {
    const value = asIsoDate(patch.invoice_date)
    if (!value) throw new Error('Invalid invoice date.')
    next.invoice_date = value
  }
  if (patch.due_date !== undefined) next.due_date = patch.due_date ? asIsoDate(patch.due_date) : null
  if (patch.currency !== undefined) next.currency = String(patch.currency || 'USD').trim().toUpperCase().slice(0, 10)
  if (patch.package_total !== undefined) next.package_total = amount(patch.package_total)
  if (patch.package_description !== undefined) next.package_description = String(patch.package_description || '').trim() || 'LankaLux Sri Lanka Journey'
  if (patch.client_note !== undefined) next.client_note = patch.client_note ? String(patch.client_note).trim() : null
  if (patch.secure_journey_url !== undefined) next.secure_journey_url = patch.secure_journey_url ? String(patch.secure_journey_url).trim() : null
  if (patch.payment_instructions !== undefined) {
    next.payment_instructions = patch.payment_instructions && typeof patch.payment_instructions === 'object' ? patch.payment_instructions : {}
  }
  return next
}

export async function updateDraftInvoice(invoiceId: string, patch: InvoiceDraftPatch, actor?: string): Promise<InvoiceBundle> {
  const current = await getInvoice(invoiceId)
  if (current.invoice.status !== 'draft') {
    throw new Error('Only draft invoices can be edited. Duplicate this invoice to create a revised version.')
  }
  const next = normalizeDraftPatch(patch)
  const sb = serverSupabase()
  const { data, error } = await sb
    .from('invoices')
    .update({
      ...next,
      updated_by: actor || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', invoiceId)
    .select('*')
    .single()
  if (error || !data) throw new Error(error?.message || 'Failed to update invoice.')

  await appendActivity(current.invoice.request_id, 'invoice_edited', { invoice_id: invoiceId }, actor)
  return summarize(toInvoiceRecord(data as Record<string, unknown>), current.payments)
}

export async function refreshDraftInvoice(invoiceId: string, actor?: string): Promise<InvoiceBundle> {
  const current = await getInvoice(invoiceId)
  if (current.invoice.status !== 'draft') throw new Error('Only draft invoices can be refreshed from request data.')
  const source = await gatherLiveInvoiceSource(current.invoice.request_id, actor)
  const journeyUrl = current.invoice.secure_journey_url || source.journey.url
  const snapshots = buildSnapshots({
    request: source.request,
    itinerary: source.itinerary,
    journeyUrl,
    vehicle: source.vehicle,
    settings: source.settings,
  })
  const sb = serverSupabase()
  const { data, error } = await sb
    .from('invoices')
    .update({
      selected_itinerary_id: source.itinerary.id.startsWith('placeholder-') || source.itinerary.id.startsWith('legacy-')
        ? String(source.itinerary.option_number)
        : source.itinerary.id,
      vehicle_id: source.vehicle?.id || null,
      chauffeur_guide_id: source.request.assigned_employee || null,
      share_link_token: source.journey.token || current.invoice.share_link_token,
      client_snapshot: snapshots.clientSnapshot,
      journey_snapshot: snapshots.journeySnapshot,
      vehicle_snapshot: snapshots.vehicleSnapshot,
      chauffeur_snapshot: snapshots.chauffeurSnapshot,
      secure_journey_url: journeyUrl,
      updated_by: actor || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', invoiceId)
    .select('*')
    .single()
  if (error || !data) throw new Error(error?.message || 'Failed to refresh invoice.')
  await appendActivity(current.invoice.request_id, 'invoice_edited', { invoice_id: invoiceId, refreshed: true }, actor)
  return summarize(toInvoiceRecord(data as Record<string, unknown>), current.payments)
}

export async function addInvoicePayment(invoiceId: string, payload: PaymentInput, actor?: string): Promise<InvoiceBundle> {
  if (!PAYMENT_METHODS.includes(payload.payment_method)) throw new Error('Invalid payment method.')
  const sb = serverSupabase()
  const current = await getInvoice(invoiceId)
  const paymentDate = asIsoDate(payload.payment_date) || new Date().toISOString().slice(0, 10)
  const row = {
    invoice_id: invoiceId,
    amount: amount(payload.amount),
    currency: String(payload.currency || current.invoice.currency || 'USD').toUpperCase(),
    payment_date: paymentDate,
    payment_method: payload.payment_method,
    reference_number: payload.reference_number?.trim() || null,
    note: payload.note?.trim() || null,
    status: 'successful',
    created_by: actor || null,
    updated_by: actor || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
  const { error } = await sb.from('invoice_payments').insert(row)
  if (error) throw new Error(error.message)

  const next = await getInvoice(invoiceId)
  await persistDerived(next, actor)
  await appendActivity(next.invoice.request_id, 'payment_recorded', {
    invoice_id: invoiceId,
    amount: row.amount,
    currency: row.currency,
    method: row.payment_method,
  }, actor)
  return getInvoice(invoiceId)
}

export async function updateInvoicePayment(
  paymentId: string,
  patch: Partial<PaymentInput> & { status?: 'successful' | 'void' },
  actor?: string
): Promise<InvoiceBundle> {
  const sb = serverSupabase()
  const { data: existing, error: readErr } = await sb.from('invoice_payments').select('*').eq('id', paymentId).single()
  if (readErr || !existing) throw new Error('Payment not found.')
  const payment = toPaymentRecord(existing as Record<string, unknown>)

  const next = {
    amount: patch.amount !== undefined ? amount(patch.amount) : payment.amount,
    currency: patch.currency !== undefined ? String(patch.currency || payment.currency).toUpperCase() : payment.currency,
    payment_date: patch.payment_date !== undefined ? asIsoDate(patch.payment_date) || payment.payment_date : payment.payment_date,
    payment_method: patch.payment_method !== undefined ? patch.payment_method : payment.payment_method,
    reference_number: patch.reference_number !== undefined ? patch.reference_number?.trim() || null : payment.reference_number,
    note: patch.note !== undefined ? patch.note?.trim() || null : payment.note,
    status: patch.status || payment.status,
    updated_by: actor || null,
    updated_at: new Date().toISOString(),
  }
  if (!PAYMENT_METHODS.includes(next.payment_method)) throw new Error('Invalid payment method.')
  const { error } = await sb.from('invoice_payments').update(next).eq('id', paymentId)
  if (error) throw new Error(error.message)

  const invoice = await getInvoice(payment.invoice_id)
  await persistDerived(invoice, actor)
  await appendActivity(invoice.invoice.request_id, 'payment_edited', { invoice_id: payment.invoice_id, payment_id: paymentId }, actor)
  return getInvoice(payment.invoice_id)
}

export async function deleteInvoicePayment(paymentId: string, actor?: string): Promise<InvoiceBundle> {
  const sb = serverSupabase()
  const { data: existing, error: readErr } = await sb.from('invoice_payments').select('*').eq('id', paymentId).single()
  if (readErr || !existing) throw new Error('Payment not found.')
  const payment = toPaymentRecord(existing as Record<string, unknown>)
  const { error } = await sb.from('invoice_payments').delete().eq('id', paymentId)
  if (error) throw new Error(error.message)

  const invoice = await getInvoice(payment.invoice_id)
  await persistDerived(invoice, actor)
  await appendActivity(invoice.invoice.request_id, 'payment_deleted', { invoice_id: payment.invoice_id, payment_id: paymentId }, actor)
  return getInvoice(payment.invoice_id)
}

export async function finalizeInvoice(invoiceId: string, actor?: string): Promise<InvoiceBundle> {
  const current = await getInvoice(invoiceId)
  if (current.invoice.status === 'cancelled') throw new Error('Cancelled invoice cannot be finalized.')
  if (current.invoice.status !== 'draft') return current

  const source = await gatherLiveInvoiceSource(current.invoice.request_id, actor)
  const snapshots = buildSnapshots({
    request: source.request,
    itinerary: source.itinerary,
    journeyUrl: current.invoice.secure_journey_url || source.journey.url,
    vehicle: source.vehicle,
    settings: source.settings,
  })
  const status = invoiceStatus('finalized', current.payment_status)
  const sb = serverSupabase()
  const { error } = await sb
    .from('invoices')
    .update({
      selected_itinerary_id: source.itinerary.id.startsWith('placeholder-') || source.itinerary.id.startsWith('legacy-')
        ? String(source.itinerary.option_number)
        : source.itinerary.id,
      vehicle_id: source.vehicle?.id || null,
      chauffeur_guide_id: source.request.assigned_employee || null,
      share_link_token: source.journey.token || current.invoice.share_link_token,
      client_snapshot: snapshots.clientSnapshot,
      journey_snapshot: snapshots.journeySnapshot,
      vehicle_snapshot: snapshots.vehicleSnapshot,
      chauffeur_snapshot: snapshots.chauffeurSnapshot,
      payment_instructions: current.invoice.payment_instructions && Object.keys(current.invoice.payment_instructions).length
        ? current.invoice.payment_instructions
        : source.settings,
      secure_journey_url: current.invoice.secure_journey_url || source.journey.url,
      status,
      payment_status: current.payment_status,
      totals_snapshot: current.totals,
      finalized_at: new Date().toISOString(),
      finalized_by: actor || null,
      updated_by: actor || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', invoiceId)
  if (error) throw new Error(error.message)
  await appendActivity(current.invoice.request_id, 'invoice_finalized', { invoice_id: invoiceId, invoice_number: current.invoice.invoice_number }, actor)
  return getInvoice(invoiceId)
}

export async function markInvoiceSent(invoiceId: string, actor?: string, channel?: 'email' | 'whatsapp'): Promise<InvoiceBundle> {
  const current = await getInvoice(invoiceId)
  if (current.invoice.status === 'draft') throw new Error('Finalize the invoice before sending.')
  if (current.invoice.status === 'cancelled') throw new Error('Cancelled invoice cannot be sent.')
  const nextStatus = invoiceStatus('sent', current.payment_status)

  const sb = serverSupabase()
  const { error } = await sb
    .from('invoices')
    .update({
      status: nextStatus,
      sent_at: new Date().toISOString(),
      sent_by: actor || null,
      updated_by: actor || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', invoiceId)
  if (error) throw new Error(error.message)
  await appendActivity(current.invoice.request_id, 'invoice_sent', { invoice_id: invoiceId, channel: channel || null }, actor)
  return getInvoice(invoiceId)
}

export async function duplicateInvoice(invoiceId: string, actor?: string): Promise<InvoiceBundle> {
  const current = await getInvoice(invoiceId)
  const now = new Date().toISOString()
  const sb = serverSupabase()
  const { data, error } = await sb
    .from('invoices')
    .insert({
      request_id: current.invoice.request_id,
      selected_itinerary_id: current.invoice.selected_itinerary_id,
      vehicle_id: current.invoice.vehicle_id,
      chauffeur_guide_id: current.invoice.chauffeur_guide_id,
      share_link_token: current.invoice.share_link_token,
      revision_of: current.invoice.id,
      status: 'draft',
      payment_status: 'unpaid',
      invoice_date: new Date().toISOString().slice(0, 10),
      due_date: current.invoice.due_date,
      currency: current.invoice.currency,
      package_total: current.invoice.package_total,
      package_description: current.invoice.package_description,
      client_note: current.invoice.client_note,
      payment_instructions: current.invoice.payment_instructions,
      client_snapshot: current.invoice.client_snapshot,
      journey_snapshot: current.invoice.journey_snapshot,
      vehicle_snapshot: current.invoice.vehicle_snapshot,
      chauffeur_snapshot: current.invoice.chauffeur_snapshot,
      totals_snapshot: { total: current.invoice.package_total, paid: 0, balance: current.invoice.package_total },
      secure_journey_url: current.invoice.secure_journey_url,
      created_by: actor || null,
      updated_by: actor || null,
      created_at: now,
      updated_at: now,
    })
    .select('*')
    .single()
  if (error || !data) throw new Error(error?.message || 'Failed to duplicate invoice.')
  const copy = toInvoiceRecord(data as Record<string, unknown>)
  await appendActivity(copy.request_id, 'invoice_revised', { invoice_id: copy.id, revision_of: invoiceId }, actor)
  return summarize(copy, [])
}

export async function listPaymentsFeed(limit = 200): Promise<Array<InvoicePaymentRecord & { invoice_number?: string; request_id?: string }>> {
  const sb = serverSupabase()
  const { data, error } = await sb
    .from('invoice_payments')
    .select('*, invoices(invoice_number, request_id)')
    .order('payment_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) {
    if (isMissingTableError(error)) return []
    throw new Error(error.message)
  }
  return (data || []).map((row) => {
    const parsed = toPaymentRecord(row as Record<string, unknown>)
    const rawMeta = (row as { invoices?: { invoice_number?: string; request_id?: string } | Array<{ invoice_number?: string; request_id?: string }> }).invoices
    const invoiceMeta = (Array.isArray(rawMeta) ? rawMeta[0] : rawMeta || {}) as {
      invoice_number?: string
      request_id?: string
    }
    return {
      ...parsed,
      invoice_number: invoiceMeta.invoice_number,
      request_id: invoiceMeta.request_id,
    }
  })
}

export async function createInvoicePublicPdfLink(invoiceId: string, actor?: string): Promise<string> {
  const token = `${Date.now().toString(36)}-${randomBytes(10).toString('base64url')}`
  const sb = serverSupabase()
  const { error } = await sb.from('invoice_public_links').insert({
    token,
    invoice_id: invoiceId,
    created_by: actor || null,
  })
  if (error) throw new Error(error.message)
  return `${appUrl()}/api/invoices/public/${token}/pdf`
}

export async function getInvoiceByPublicToken(token: string): Promise<InvoiceBundle> {
  const sb = serverSupabase()
  const { data, error } = await sb
    .from('invoice_public_links')
    .select('invoice_id, revoked_at')
    .eq('token', token)
    .maybeSingle()
  if (error || !data || data.revoked_at) throw new Error('Invoice link is invalid or expired.')
  return getInvoice(String(data.invoice_id))
}

export async function addInvoiceActivity(
  invoiceId: string,
  eventType: string,
  detail: Record<string, unknown>,
  actor?: string
) {
  const invoice = await getInvoiceRow(invoiceId)
  await appendActivity(invoice.request_id, eventType, { invoice_id: invoiceId, ...detail }, actor)
}

export function invoicePreviewModel(bundle: InvoiceBundle) {
  const invoice = bundle.invoice
  const client = safeParseJson<Record<string, unknown>>(invoice.client_snapshot, {})
  const journey = safeParseJson<Record<string, unknown>>(invoice.journey_snapshot, {})
  const vehicle = safeParseJson<Record<string, unknown>>(invoice.vehicle_snapshot, {})
  const chauffeur = safeParseJson<Record<string, unknown>>(invoice.chauffeur_snapshot, {})
  const paymentInstructions = safeParseJson<Record<string, unknown>>(invoice.payment_instructions, {})

  return {
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoice_number,
    invoiceDate: invoice.invoice_date,
    dueDate: invoice.due_date,
    status: invoice.status,
    paymentStatus: bundle.payment_status,
    currency: invoice.currency,
    packageDescription: invoice.package_description,
    packageTotal: bundle.totals.total,
    totalPaid: bundle.totals.paid,
    balanceDue: bundle.totals.balance,
    client: {
      name: String(client.lead_traveller_name || 'Guest'),
      additionalNames: Array.isArray(client.additional_traveller_names) ? client.additional_traveller_names.map((x) => String(x)) : [],
      email: client.email ? String(client.email) : null,
      phone: client.phone_whatsapp ? String(client.phone_whatsapp) : null,
      country: client.country ? String(client.country) : null,
      adults: Number(client.adults || 0),
      children: Number(client.children || 0),
      childrenAges: Array.isArray(client.children_ages) ? client.children_ages.map((x) => Number(x)).filter((x) => Number.isFinite(x)) : [],
    },
    travelDates: {
      start: journey.arrival_date ? String(journey.arrival_date) : null,
      end: journey.departure_date ? String(journey.departure_date) : null,
    },
    journey: {
      title: String(journey.title || 'LankaLux Journey'),
      days: Number(journey.days || 0),
      nights: Number(journey.nights || 0),
      destinations: Array.isArray(journey.destinations) ? journey.destinations.map((x) => String(x)) : [],
      summary: String(journey.summary || ''),
      secureLink: journey.secure_journey_link ? String(journey.secure_journey_link) : invoice.secure_journey_url,
    },
    vehicle: {
      name: vehicle.name ? String(vehicle.name) : null,
      category: vehicle.category ? String(vehicle.category) : null,
      description: vehicle.description ? String(vehicle.description) : null,
      passengerCapacity: vehicle.passenger_capacity ? Number(vehicle.passenger_capacity) : null,
      registrationNumber: vehicle.registration_number ? String(vehicle.registration_number) : null,
      image: vehicle.image ? String(vehicle.image) : null,
    },
    chauffeurGuide: {
      name: chauffeur.name ? String(chauffeur.name) : null,
      role: chauffeur.role ? String(chauffeur.role) : 'LankaLux Chauffeur-Guide',
      languages: Array.isArray(chauffeur.languages) ? chauffeur.languages.map((x) => String(x)) : [],
      phone: chauffeur.phone ? String(chauffeur.phone) : null,
      image: chauffeur.image ? String(chauffeur.image) : null,
    },
    payments: bundle.payments
      .filter((p) => p.status === 'successful')
      .map((p) => ({
        id: p.id,
        date: p.payment_date,
        method: humanPaymentMethod(p.payment_method),
        reference: p.reference_number,
        amount: p.amount,
        currency: p.currency,
        note: p.note,
      })),
    paymentInstructions: visiblePaymentInstructions(paymentInstructions),
    clientNote: invoice.client_note,
    included: INVOICE_INCLUDED,
    formatted: {
      invoiceDate: formatDateLabel(invoice.invoice_date),
      dueDate: formatDateLabel(invoice.due_date),
      travelStart: formatDateLabel(journey.arrival_date ? String(journey.arrival_date) : null),
      travelEnd: formatDateLabel(journey.departure_date ? String(journey.departure_date) : null),
      packageTotal: formatMoney(bundle.totals.total, invoice.currency),
      totalPaid: formatMoney(bundle.totals.paid, invoice.currency),
      balanceDue: formatMoney(bundle.totals.balance, invoice.currency),
    },
  }
}

export function invoiceEmailBody(model: ReturnType<typeof invoicePreviewModel>) {
  return {
    subject: `${model.invoiceNumber} · LankaLux Invoice`,
    text: `Dear ${model.client.name},

Please find attached your LankaLux invoice for your upcoming Sri Lanka journey.

Invoice: ${model.invoiceNumber}
Travel dates: ${model.formatted.travelStart} - ${model.formatted.travelEnd}

You can also view your complete journey using the link below.

${model.journey.secureLink ? `VIEW YOUR JOURNEY\n${model.journey.secureLink}` : 'Journey link unavailable'}

Warm regards,
LankaLux`,
  }
}

export { formatMoney, formatDateLabel, humanPaymentMethod }
