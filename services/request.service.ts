import { ID_PREFIX } from '@/config/status'
import { getServiceClient, AppError, isMissingTableError } from '@/services/supabase.server'
import { logActivity } from '@/services/activity.service'
import type { ClientRequestRow, RequestInput } from '@/types/domain'

export function inclusiveDuration(start: string | null | undefined, end: string | null | undefined): number | null {
  if (!start || !end) return null
  const a = new Date(`${start}T00:00:00Z`)
  const b = new Date(`${end}T00:00:00Z`)
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null
  return Math.floor(Math.abs(b.getTime() - a.getTime()) / 86400000) + 1
}

export function parseChildrenAges(raw: string | null | undefined): number[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.map((n) => parseInt(String(n), 10)).filter((n) => Number.isFinite(n))
  } catch {
    return []
  }
}

export async function nextRequestId(): Promise<string> {
  const supabase = getServiceClient()
  const { data, error } = await supabase.from('Client Requests').select('id').order('created_at', { ascending: false }).limit(4000)
  if (error) throw new AppError(`Supabase request failed: ${error.message}`, 500)
  const nums: number[] = []
  const re = new RegExp(`^${ID_PREFIX}(\\d+)$`)
  for (const row of data || []) {
    const m = String(row.id || '').match(re)
    if (m) nums.push(parseInt(m[1], 10))
  }
  const next = (nums.length ? Math.max(...nums) : 0) + 1
  return `${ID_PREFIX}${String(next).padStart(3, '0')}`
}

function toInsert(input: RequestInput, id: string) {
  const duration = inclusiveDuration(input.start_date ?? null, input.end_date ?? null)
  return {
    id,
    client_name: input.client_name.trim(),
    email: input.email.trim(),
    whatsapp: input.whatsapp?.trim() || null,
    origin_country: input.origin_country?.trim() || null,
    start_date: input.start_date || null,
    end_date: input.end_date || null,
    duration,
    number_of_adults: input.number_of_adults ?? null,
    number_of_children: input.number_of_children ?? null,
    children_ages: input.children_ages?.length ? JSON.stringify(input.children_ages) : null,
    additional_preferences: input.additional_preferences?.trim() || null,
    assigned_employee: input.assigned_employee?.trim() || null,
    lead_source: input.lead_source?.trim() || null,
    budget: input.budget?.trim() || null,
    hotel_preference: input.hotel_preference?.trim() || null,
    vehicle_preference: input.vehicle_preference?.trim() || null,
    special_requirements: input.special_requirements?.trim() || null,
    interests: input.interests?.trim() || null,
    arrival_flight: input.arrival_flight?.trim() || null,
    departure_flight: input.departure_flight?.trim() || null,
    requested_destinations: input.requested_destinations?.trim() || null,
    notes: input.notes?.trim() || null,
    status: input.status || 'new',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
}

export async function listRequests(): Promise<ClientRequestRow[]> {
  const supabase = getServiceClient()
  const { data, error } = await supabase.from('Client Requests').select('*').order('created_at', { ascending: false })
  if (error) throw new AppError(`Supabase request failed: ${error.message}`, 500)
  return (data || []) as ClientRequestRow[]
}

export async function getRequest(id: string): Promise<ClientRequestRow> {
  const supabase = getServiceClient()
  const { data, error } = await supabase.from('Client Requests').select('*').eq('id', id).single()
  if (error || !data) throw new AppError('Request not found', 404)
  return data as ClientRequestRow
}

export async function createRequest(input: RequestInput, actor?: string): Promise<ClientRequestRow> {
  if (!input.client_name?.trim()) throw new AppError('Client name is required')
  if (!input.email?.trim()) throw new AppError('Email is required')
  const id = await nextRequestId()
  const supabase = getServiceClient()
  const payload = toInsert(input, id)
  let { data, error } = await supabase.from('Client Requests').insert(payload).select('*').single()

  if (error && isMissingTableError(error)) {
    const legacy = { ...payload } as Record<string, unknown>
    for (const key of [
      'assigned_employee',
      'lead_source',
      'budget',
      'hotel_preference',
      'vehicle_preference',
      'special_requirements',
      'interests',
      'arrival_flight',
      'departure_flight',
      'requested_destinations',
    ]) {
      delete legacy[key]
    }
    const retry = await supabase.from('Client Requests').insert(legacy).select('*').single()
    data = retry.data
    error = retry.error
  }

  if (error || !data) throw new AppError(error?.message || 'Failed to create request', 500)
  await logActivity({ request_id: id, actor, event_type: 'request_created', detail: { client_name: input.client_name } })
  return data as ClientRequestRow
}

export async function updateRequest(id: string, patch: Partial<RequestInput> & { status?: string; cancellation_reason?: string | null }, actor?: string): Promise<ClientRequestRow> {
  const supabase = getServiceClient()
  const current = await getRequest(id)
  const next: Record<string, unknown> = { updated_at: new Date().toISOString() }

  const map: Array<[keyof RequestInput, string]> = [
    ['client_name', 'client_name'],
    ['email', 'email'],
    ['whatsapp', 'whatsapp'],
    ['origin_country', 'origin_country'],
    ['start_date', 'start_date'],
    ['end_date', 'end_date'],
    ['number_of_adults', 'number_of_adults'],
    ['number_of_children', 'number_of_children'],
    ['additional_preferences', 'additional_preferences'],
    ['assigned_employee', 'assigned_employee'],
    ['lead_source', 'lead_source'],
    ['budget', 'budget'],
    ['hotel_preference', 'hotel_preference'],
    ['vehicle_preference', 'vehicle_preference'],
    ['special_requirements', 'special_requirements'],
    ['interests', 'interests'],
    ['arrival_flight', 'arrival_flight'],
    ['departure_flight', 'departure_flight'],
    ['requested_destinations', 'requested_destinations'],
    ['notes', 'notes'],
  ]
  for (const [k, col] of map) {
    if (k in patch) next[col] = patch[k] ?? null
  }
  if (patch.children_ages) next.children_ages = JSON.stringify(patch.children_ages)
  if (patch.status) next.status = patch.status
  if ('cancellation_reason' in patch) next.cancellation_reason = patch.cancellation_reason ?? null
  if (patch.start_date !== undefined || patch.end_date !== undefined) {
    next.duration = inclusiveDuration(
      (patch.start_date as string) ?? current.start_date,
      (patch.end_date as string) ?? current.end_date
    )
  }

  const { data, error } = await supabase.from('Client Requests').update(next).eq('id', id).select('*').single()
  if (error || !data) throw new AppError(error?.message || 'Failed to update request', 500)

  if (patch.status && patch.status !== current.status) {
    await logActivity({
      request_id: id,
      actor,
      event_type: 'status_changed',
      detail: { from: current.status, to: patch.status },
    })
  }
  if (patch.assigned_employee !== undefined && patch.assigned_employee !== current.assigned_employee) {
    await logActivity({
      request_id: id,
      actor,
      event_type: 'assignee_changed',
      detail: { from: current.assigned_employee, to: patch.assigned_employee },
    })
  }
  if (patch.notes !== undefined && patch.notes !== current.notes) {
    await logActivity({ request_id: id, actor, event_type: 'notes_added' })
  }

  return data as ClientRequestRow
}

export async function restoreRequest(id: string, actor?: string): Promise<ClientRequestRow> {
  return updateRequest(id, { status: 'follow_up', cancellation_reason: null }, actor)
}
