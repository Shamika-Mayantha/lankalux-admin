import { BRAND } from '@/config/brand'
import { PROMPT_VERSION, STYLE_META, styleFromNumber, type ItineraryStyle } from '@/config/status'
import { assignDayImages } from '@/services/image-map.service'
import { logActivity } from '@/services/activity.service'
import { getRequest, parseChildrenAges } from '@/services/request.service'
import { getServiceClient, AppError, isMissingTableError } from '@/services/supabase.server'
import type {
  CanonicalJourney,
  ClientRequestRow,
  ItineraryDay,
  ItineraryRecord,
  StructuredItinerary,
  VehicleRecord,
} from '@/types/domain'
import { parseItineraryJson } from '@/validation/itinerary.schema'

const EMPTY_TRAVEL = { from: '', to: '', estimated_distance: '', estimated_duration: '' }

function cleanTitle(raw: string, dayNumber: number, location: string) {
  let cleaned = (raw || '')
    .replace(new RegExp(`^day\\s*${dayNumber}\\s*[-–:|]?\\s*`, 'i'), '')
    .replace(/^[A-Za-z]+,\s+[A-Za-z]+\s+\d{1,2},\s+\d{4}\s*[-–:|]?\s*/i, '')
    .replace(/^day\s*\d+\s*[-–:|]\s*/i, '')
    .trim()
  if (!cleaned || /^day\s*\d+$/i.test(cleaned)) {
    cleaned = location ? `Arrival in ${location}` : 'Journey highlights'
  }
  return cleaned
}

export function toStructured(raw: unknown, startDate?: string | null): StructuredItinerary {
  const parsed = parseItineraryJson(raw)
  if (!parsed.ok) throw new AppError(parsed.error, 422)
  const data = parsed.data
  const images = assignDayImages(data.days)
  const days: ItineraryDay[] = data.days.map((d, i) => {
    const location = (d.location || '').trim()
    const date =
      d.date ||
      (startDate
        ? (() => {
            const dt = new Date(`${startDate}T00:00:00`)
            dt.setDate(dt.getDate() + i)
            return dt.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
          })()
        : '')
    const description = (d.description || d.what_to_expect || '').trim()
    const recommended = images[i]?.length
      ? images[i]
      : d.image
        ? [d.image]
        : []
    return {
      day: i + 1,
      date,
      location,
      overnight_location: (d.overnight_location || location).trim(),
      title: cleanTitle(d.title || '', i + 1, location),
      description,
      activities: d.activities,
      optional_activities: d.optional_activities,
      travel: {
        from: d.travel?.from || '',
        to: d.travel?.to || '',
        estimated_distance: d.travel?.estimated_distance || '',
        estimated_duration: d.travel?.estimated_duration || '',
      },
      recommended_images: recommended,
      hotel_id: null,
    }
  })
  return {
    title: data.title.trim(),
    summary: data.summary.trim(),
    duration: data.duration != null ? String(data.duration) : `${days.length} days`,
    days,
  }
}

function emptyPayload(style: ItineraryStyle): StructuredItinerary {
  const meta = STYLE_META[style]
  return { title: meta.subtitle, summary: '', duration: '', days: [], price: '' }
}

function recordFromRow(row: Record<string, unknown>): ItineraryRecord {
  const option_number = Number(row.option_number) as 1 | 2 | 3
  const payload = (row.payload && typeof row.payload === 'object' ? row.payload : emptyPayload(styleFromNumber(option_number))) as StructuredItinerary
  return {
    id: String(row.id),
    request_id: String(row.request_id),
    option_number,
    style: (row.style as ItineraryStyle) || styleFromNumber(option_number),
    status: (row.status as ItineraryRecord['status']) || 'draft',
    is_selected: !!row.is_selected,
    title: String(row.title || payload.title || ''),
    summary: String(row.summary || payload.summary || ''),
    duration: String(row.duration || payload.duration || ''),
    payload,
    vehicle_id: (row.vehicle_id as string) || payload.vehicle_id || null,
    internal_notes: String(row.internal_notes || payload.internal_notes || ''),
    prompt_version: (row.prompt_version as string) || null,
    model: (row.model as string) || null,
    error: (row.error as string) || null,
    created_at: String(row.created_at || ''),
    updated_at: String(row.updated_at || ''),
  }
}

function legacyOptionToStructured(opt: unknown, startDate: string | null): StructuredItinerary | null {
  if (!opt || typeof opt !== 'object') return null
  const o = opt as Record<string, unknown>
  let daysRaw = o.days
  if (typeof daysRaw === 'string') {
    daysRaw = [{ day: 1, title: 'Itinerary', location: '', activities: daysRaw.split(/\n+/).filter(Boolean) }]
  }
  try {
    return toStructured(
      {
        title: o.title || 'Journey',
        summary: o.summary || 'A tailor-made Sri Lanka journey.',
        duration: o.duration,
        days: Array.isArray(daysRaw) ? daysRaw : [],
      },
      startDate
    )
  } catch {
    return null
  }
}

async function readLegacyOptions(request: ClientRequestRow): Promise<ItineraryRecord[]> {
  let parsed: { options?: unknown[] } = { options: [] }
  if (request.itineraryoptions) {
    try {
      parsed = typeof request.itineraryoptions === 'string' ? JSON.parse(request.itineraryoptions) : (request.itineraryoptions as { options?: unknown[] })
    } catch {
      parsed = { options: [] }
    }
  }
  const options = Array.isArray(parsed.options) ? parsed.options : []
  return [1, 2, 3].map((n) => {
    const style = styleFromNumber(n)
    const payload = legacyOptionToStructured(options[n - 1], request.start_date) || emptyPayload(style)
    const hasDays = payload.days.length > 0
    return {
      id: `legacy-${request.id}-${n}`,
      request_id: request.id,
      option_number: n as 1 | 2 | 3,
      style,
      status: hasDays ? 'draft' : 'empty',
      is_selected: request.selected_option === n - 1,
      title: payload.title,
      summary: payload.summary,
      duration: payload.duration,
      payload,
      vehicle_id: payload.vehicle_id || null,
      internal_notes: payload.internal_notes || '',
      prompt_version: null,
      model: null,
      error: null,
      created_at: request.created_at,
      updated_at: request.updated_at || request.created_at,
    }
  })
}

async function syncLegacyJson(requestId: string, records: ItineraryRecord[]) {
  const supabase = getServiceClient()
  const options = [1, 2, 3].map((n) => {
    const rec = records.find((r) => r.option_number === n)
    if (!rec || rec.status === 'empty' || (rec.status === 'failed' && !rec.payload.days.length)) return null
    return {
      title: rec.payload.title,
      summary: rec.payload.summary,
      duration: rec.payload.duration,
      days: rec.payload.days.map((d) => ({
        day: d.day,
        date: d.date,
        title: d.title,
        location: d.location,
        image: d.recommended_images[0],
        activities: d.activities,
        optional_activities: d.optional_activities,
        what_to_expect: d.description,
        travel: d.travel,
      })),
    }
  })
  const selected = records.find((r) => r.is_selected)
  await supabase
    .from('Client Requests')
    .update({
      itineraryoptions: JSON.stringify({ options }),
      selected_option: selected ? selected.option_number - 1 : null,
      selected_itinerary_id: selected && !selected.id.startsWith('legacy-') ? selected.id : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', requestId)
}

export async function listItineraries(requestId: string): Promise<ItineraryRecord[]> {
  const supabase = getServiceClient()
  const { data, error } = await supabase.from('itineraries').select('*').eq('request_id', requestId).order('option_number')
  if (!error && data && data.length) {
    const byNum = new Map(data.map((r) => [Number(r.option_number), recordFromRow(r)]))
    return [1, 2, 3].map((n) => byNum.get(n) || placeholder(requestId, n as 1 | 2 | 3))
  }
  if (error && !isMissingTableError(error) && error.code !== 'PGRST116') {
    console.error('itineraries read:', error.message)
  }
  const request = await getRequest(requestId)
  return readLegacyOptions(request)
}

function placeholder(requestId: string, n: 1 | 2 | 3): ItineraryRecord {
  const style = styleFromNumber(n)
  const payload = emptyPayload(style)
  return {
    id: `placeholder-${requestId}-${n}`,
    request_id: requestId,
    option_number: n,
    style,
    status: 'empty',
    is_selected: false,
    title: payload.title,
    summary: '',
    duration: '',
    payload,
    vehicle_id: null,
    internal_notes: '',
    prompt_version: null,
    model: null,
    error: null,
    created_at: '',
    updated_at: '',
  }
}

export async function ensureSlots(requestId: string): Promise<ItineraryRecord[]> {
  const existing = await listItineraries(requestId)
  const supabase = getServiceClient()
  for (const rec of existing) {
    if (rec.id.startsWith('legacy-') || rec.id.startsWith('placeholder-')) {
      const style = rec.style
      const { error } = await supabase.from('itineraries').insert({
        request_id: requestId,
        option_number: rec.option_number,
        style,
        status: rec.status === 'empty' ? 'empty' : rec.status,
        is_selected: rec.is_selected,
        title: rec.title,
        summary: rec.summary,
        duration: rec.duration,
        payload: rec.payload,
        prompt_version: PROMPT_VERSION,
      })
      if (error && !isMissingTableError(error) && !/duplicate|unique/i.test(error.message)) {
        console.error('ensureSlots', error.message)
      }
    }
  }
  return listItineraries(requestId)
}

export async function saveGeneratedOption(opts: {
  requestId: string
  optionNumber: 1 | 2 | 3
  payload: StructuredItinerary
  model: string
  actor?: string
}): Promise<ItineraryRecord> {
  const style = styleFromNumber(opts.optionNumber)
  const supabase = getServiceClient()
  const now = new Date().toISOString()
  const row = {
    request_id: opts.requestId,
    option_number: opts.optionNumber,
    style,
    status: 'draft' as const,
    title: opts.payload.title,
    summary: opts.payload.summary,
    duration: opts.payload.duration,
    payload: opts.payload,
    prompt_version: PROMPT_VERSION,
    model: opts.model,
    error: null,
    updated_at: now,
  }

  const { data, error } = await supabase
    .from('itineraries')
    .upsert(row, { onConflict: 'request_id,option_number' })
    .select('*')
    .single()

  let saved: ItineraryRecord
  if (error || !data) {
    if (error && !isMissingTableError(error)) throw new AppError(`Supabase request failed: ${error.message}`, 500)
    saved = {
      ...placeholder(opts.requestId, opts.optionNumber),
      status: 'draft',
      title: opts.payload.title,
      summary: opts.payload.summary,
      duration: opts.payload.duration,
      payload: opts.payload,
      model: opts.model,
      prompt_version: PROMPT_VERSION,
      updated_at: now,
    }
  } else {
    saved = recordFromRow(data)
  }

  const all = await listItineraries(opts.requestId)
  const merged = all.map((r) => (r.option_number === opts.optionNumber ? saved : r))
  await syncLegacyJson(opts.requestId, merged)
  await logActivity({
    request_id: opts.requestId,
    actor: opts.actor,
    event_type: 'itinerary_generated',
    detail: { option_number: opts.optionNumber, title: saved.title },
  })
  return saved
}

export async function markOptionFailed(requestId: string, optionNumber: 1 | 2 | 3, message: string) {
  const supabase = getServiceClient()
  const existing = (await listItineraries(requestId)).find((r) => r.option_number === optionNumber)
  const { error } = await supabase
    .from('itineraries')
    .upsert(
      {
        request_id: requestId,
        option_number: optionNumber,
        style: styleFromNumber(optionNumber),
        status: existing?.payload?.days?.length ? existing.status : 'failed',
        error: message,
        updated_at: new Date().toISOString(),
        payload: existing?.payload || emptyPayload(styleFromNumber(optionNumber)),
        title: existing?.title,
        summary: existing?.summary,
        duration: existing?.duration,
      },
      { onConflict: 'request_id,option_number' }
    )
  if (error && !isMissingTableError(error)) console.error(error.message)
}

export async function saveGenerationLog(log: {
  request_id: string
  itinerary_id?: string | null
  itinerary_number: 1 | 2 | 3
  prompt_version: string
  model: string
  success: boolean
  error?: string | null
  raw_response?: string | null
  parsed_response?: unknown
  retry_count: number
}) {
  const supabase = getServiceClient()
  const { error } = await supabase.from('itinerary_generations').insert(log)
  if (!error) return
  if (!isMissingTableError(error)) {
    console.error('generation log:', error.message)
    return
  }
  const { data } = await supabase.from('Client Requests').select('generation_logs').eq('id', log.request_id).maybeSingle()
  const existing = Array.isArray((data as { generation_logs?: unknown[] } | null)?.generation_logs)
    ? ((data as { generation_logs: unknown[] }).generation_logs)
    : []
  const next = [{ ...log, created_at: new Date().toISOString() }, ...existing].slice(0, 50)
  await supabase.from('Client Requests').update({ generation_logs: next }).eq('id', log.request_id)
}

export async function listGenerationLogs(requestId: string) {
  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from('itinerary_generations')
    .select('*')
    .eq('request_id', requestId)
    .order('created_at', { ascending: false })
    .limit(50)
  if (!error && data) return data
  const { data: row } = await supabase.from('Client Requests').select('generation_logs').eq('id', requestId).maybeSingle()
  return Array.isArray((row as { generation_logs?: unknown[] } | null)?.generation_logs)
    ? (row as { generation_logs: unknown[] }).generation_logs
    : []
}

export async function selectItinerary(requestId: string, optionNumber: 1 | 2 | 3, actor?: string): Promise<ItineraryRecord> {
  const all = await listItineraries(requestId)
  const target = all.find((r) => r.option_number === optionNumber)
  if (!target || target.status === 'empty' || target.status === 'failed') {
    throw new AppError('That itinerary is not available to select.', 400)
  }
  const supabase = getServiceClient()
  const now = new Date().toISOString()

  if (!target.id.startsWith('legacy-') && !target.id.startsWith('placeholder-')) {
    await supabase.from('itineraries').update({ is_selected: false, updated_at: now }).eq('request_id', requestId)
    await supabase
      .from('itineraries')
      .update({ is_selected: true, status: 'published', updated_at: now })
      .eq('id', target.id)
  }

  const selected = { ...target, is_selected: true, status: 'published' as const }
  const merged = all.map((r) => ({ ...r, is_selected: r.option_number === optionNumber }))
  await syncLegacyJson(requestId, merged.map((r) => (r.option_number === optionNumber ? selected : { ...r, is_selected: false })))

  if (!target.id.startsWith('legacy-')) {
    await supabase
      .from('Client Requests')
      .update({ published_itinerary_id: target.id, selected_itinerary_id: target.id, updated_at: now })
      .eq('id', requestId)
  }

  await logActivity({
    request_id: requestId,
    actor,
    event_type: 'itinerary_selected',
    detail: { option_number: optionNumber, title: target.title },
  })
  return selected
}

export async function updateItineraryDraft(
  requestId: string,
  optionNumber: 1 | 2 | 3,
  payload: StructuredItinerary,
  extras?: { vehicle_id?: string | null; internal_notes?: string },
  actor?: string
): Promise<ItineraryRecord> {
  parseItineraryJson(payload)
  const all = await listItineraries(requestId)
  const current = all.find((r) => r.option_number === optionNumber)
  if (!current) throw new AppError('Itinerary not found', 404)

  const nextPayload: StructuredItinerary = {
    ...payload,
    vehicle_id: extras?.vehicle_id !== undefined ? extras.vehicle_id : payload.vehicle_id,
    internal_notes: extras?.internal_notes ?? payload.internal_notes,
  }
  const supabase = getServiceClient()
  const now = new Date().toISOString()

  let saved = current
  if (!current.id.startsWith('legacy-') && !current.id.startsWith('placeholder-')) {
    const { data, error } = await supabase
      .from('itineraries')
      .update({
        title: nextPayload.title,
        summary: nextPayload.summary,
        duration: nextPayload.duration,
        payload: nextPayload,
        vehicle_id: nextPayload.vehicle_id ?? null,
        internal_notes: nextPayload.internal_notes ?? '',
        status: current.is_selected ? 'published' : 'draft',
        updated_at: now,
      })
      .eq('id', current.id)
      .select('*')
      .single()
    if (error) throw new AppError(`Supabase request failed: ${error.message}`, 500)
    saved = recordFromRow(data)
  } else {
    saved = { ...current, title: nextPayload.title, summary: nextPayload.summary, duration: nextPayload.duration, payload: nextPayload, status: 'draft' }
  }

  const merged = all.map((r) => (r.option_number === optionNumber ? saved : r))
  await syncLegacyJson(requestId, merged)
  await logActivity({ request_id: requestId, actor, event_type: 'itinerary_edited', detail: { option_number: optionNumber } })
  return saved
}

async function getVehicle(id: string | null | undefined): Promise<VehicleRecord | null> {
  if (!id) return null
  const supabase = getServiceClient()
  const { data } = await supabase.from('vehicles').select('*').eq('id', id).maybeSingle()
  if (data) {
    const row = data as VehicleRecord & { photos: unknown }
    return { ...row, photos: Array.isArray(row.photos) ? (row.photos as string[]) : [] }
  }
  const { FLEET } = await import('@/config/fleet')
  return FLEET.find((v) => v.id === id) || null
}

async function hotelsForRequest(requestId: string) {
  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from('request_hotels')
    .select('id, hotel_id, snapshot, hotels(*)')
    .eq('request_id', requestId)
  if (error || !data) return []
  return data.map((row: Record<string, unknown>) => {
    const hotel = (row.hotels || row.snapshot || {}) as Record<string, unknown>
    const images = Array.isArray(hotel.images) ? (hotel.images as string[]) : []
    return {
      id: String(hotel.id || row.hotel_id || row.id),
      name: String(hotel.name || 'Hotel'),
      destination: String(hotel.destination || ''),
      star_category: String(hotel.star_category || ''),
      description: String(hotel.description || ''),
      room_category: String(hotel.room_category || ''),
      meal_plan: String(hotel.meal_plan || ''),
      images,
      website: (hotel.website as string) || null,
    }
  })
}

export async function getPublishedItinerary(requestId: string): Promise<CanonicalJourney> {
  const request = await getRequest(requestId)
  const all = await listItineraries(requestId)
  const selected = all.find((r) => r.is_selected) || all.find((r) => r.status === 'published')
  if (!selected || !selected.payload.days.length) {
    throw new AppError('No itinerary has been selected for this request.', 400)
  }
  return toCanonical(request, selected)
}

export async function getClientItinerary(shareToken: string): Promise<CanonicalJourney> {
  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from('share_links')
    .select('*')
    .eq('token', shareToken)
    .is('revoked_at', null)
    .maybeSingle()

  if (data && !error) {
    const snapshot = data.itinerary_snapshot as CanonicalJourney
    if (snapshot?.days) {
      return { ...snapshot, shareToken }
    }
  }

  if (error && !isMissingTableError(error)) {
    throw new AppError(`Supabase request failed: ${error.message}`, 500)
  }

  throw new AppError('This journey link is invalid or has expired.', 404)
}

export async function toCanonical(request: ClientRequestRow, itinerary: ItineraryRecord): Promise<CanonicalJourney> {
  const vehicle = await getVehicle(itinerary.vehicle_id || itinerary.payload.vehicle_id)
  const hotels = await hotelsForRequest(request.id)
  const ages = parseChildrenAges(request.children_ages)
  return {
    requestId: request.id,
    clientName: request.client_name || 'Guest',
    email: request.email,
    whatsapp: request.whatsapp,
    title: itinerary.payload.title || itinerary.title,
    summary: itinerary.payload.summary || itinerary.summary,
    startDate: request.start_date,
    endDate: request.end_date,
    durationDays: request.duration,
    durationLabel: itinerary.payload.duration || (request.duration ? `${request.duration} days` : ''),
    party: {
      adults: request.number_of_adults || 0,
      children: request.number_of_children || 0,
      childrenAges: ages,
    },
    days: itinerary.payload.days,
    vehicle: vehicle
      ? { id: vehicle.id, name: vehicle.name, description: vehicle.description || '', photos: vehicle.photos || [] }
      : null,
    hotels,
    includedServices: BRAND.includedServices,
    importantInformation: BRAND.importantInformation,
    optionNumber: itinerary.option_number,
    style: itinerary.style,
    price: itinerary.payload.price || null,
  }
}

export { EMPTY_TRAVEL }
