import { FLEET } from '@/config/fleet'
import { getServiceClient, AppError, isMissingTableError } from '@/services/supabase.server'
import type { HotelRecord, VehicleRecord } from '@/types/domain'
import { logActivity } from '@/services/activity.service'

function asHotel(row: Record<string, unknown>): HotelRecord {
  return {
    id: String(row.id),
    name: String(row.name || ''),
    destination: (row.destination as string) || null,
    star_category: (row.star_category as string) || null,
    description: (row.description as string) || null,
    room_category: (row.room_category as string) || null,
    meal_plan: (row.meal_plan as string) || null,
    price_internal: (row.price_internal as string) || null,
    images: Array.isArray(row.images) ? (row.images as string[]) : [],
    website: (row.website as string) || null,
    contact: (row.contact as string) || null,
    internal_notes: (row.internal_notes as string) || null,
    active: row.active !== false,
  }
}

export async function listHotels(): Promise<HotelRecord[]> {
  const supabase = getServiceClient()
  const { data, error } = await supabase.from('hotels').select('*').order('name')
  if (error) {
    if (isMissingTableError(error)) return []
    throw new AppError(`Supabase request failed: ${error.message}`, 500)
  }
  return (data || []).map((r) => asHotel(r as Record<string, unknown>))
}

export async function upsertHotel(input: Partial<HotelRecord> & { name: string }, id?: string): Promise<HotelRecord> {
  const supabase = getServiceClient()
  const row = {
    name: input.name,
    destination: input.destination ?? null,
    star_category: input.star_category ?? null,
    description: input.description ?? null,
    room_category: input.room_category ?? null,
    meal_plan: input.meal_plan ?? null,
    price_internal: input.price_internal ?? null,
    images: input.images ?? [],
    website: input.website ?? null,
    contact: input.contact ?? null,
    internal_notes: input.internal_notes ?? null,
    active: input.active !== false,
    updated_at: new Date().toISOString(),
  }
  const q = id
    ? supabase.from('hotels').update(row).eq('id', id).select('*').single()
    : supabase.from('hotels').insert(row).select('*').single()
  const { data, error } = await q
  if (error || !data) throw new AppError(error?.message || 'Failed to save hotel', 500)
  return asHotel(data as Record<string, unknown>)
}

export async function attachHotel(requestId: string, hotelId: string, actor?: string) {
  const supabase = getServiceClient()
  const { data: hotel, error: hErr } = await supabase.from('hotels').select('*').eq('id', hotelId).single()
  if (hErr || !hotel) throw new AppError('Hotel not found', 404)
  const { error } = await supabase.from('request_hotels').insert({
    request_id: requestId,
    hotel_id: hotelId,
    snapshot: hotel,
  })
  if (error) throw new AppError(error.message, 500)
  await logActivity({ request_id: requestId, actor, event_type: 'hotel_proposal_attached', detail: { hotelId, name: hotel.name } })
}

export async function listVehicles(): Promise<VehicleRecord[]> {
  const supabase = getServiceClient()
  const { data, error } = await supabase.from('vehicles').select('*').order('name')
  if (error || !data?.length) {
    if (error && !isMissingTableError(error)) throw new AppError(error.message, 500)
    return FLEET
  }
  return data.map((row) => ({
    ...(row as VehicleRecord),
    photos: Array.isArray((row as VehicleRecord).photos) ? (row as VehicleRecord).photos : [],
  }))
}
