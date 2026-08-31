import { FLEET } from '@/config/fleet'
import { getServiceClient, AppError, isMissingTableError } from '@/services/supabase.server'
import type { DriverRecord, HotelRecord, VehicleRecord } from '@/types/domain'
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

export async function listDrivers(): Promise<DriverRecord[]> {
  const supabase = getServiceClient()
  const { data, error } = await supabase.from('drivers').select('id, full_name, phone, status, profile_id').order('full_name')
  if (error) {
    if (isMissingTableError(error)) return []
    throw new AppError(error.message, 500)
  }
  const emails = new Map<string, string | null>()
  try {
    const { data: usersData } = await supabase.auth.admin.listUsers({ perPage: 1000 })
    for (const user of usersData?.users || []) {
      if (user.id) emails.set(user.id, user.email ?? null)
    }
  } catch {
    // Email labels are optional in the picker.
  }
  return (data || []).map((row) => {
    const profileId = row.profile_id ? String(row.profile_id) : ''
    return {
      id: String(row.id),
      full_name: String(row.full_name || 'Chauffeur'),
      email: profileId ? emails.get(profileId) || null : null,
      phone: row.phone ? String(row.phone) : null,
      status: String(row.status || 'active'),
    }
  })
}

function driverScore(driver: DriverRecord, query: string): number {
  const q = query.trim().toLowerCase()
  if (!q) return 0
  const name = driver.full_name.trim().toLowerCase()
  const email = (driver.email || '').trim().toLowerCase()
  const local = email.split('@')[0] || ''
  if (email && email === q) return 100
  if (name && name === q) return 90
  if (local && local === q) return 80
  if (email.startsWith(q) || local.startsWith(q) || name.startsWith(q)) return 70
  if (email.includes(q) || name.includes(q)) return 50
  return 0
}

export function matchDriver(drivers: DriverRecord[], query: string | null | undefined): DriverRecord | null {
  const q = String(query || '').trim()
  if (!q) return null
  const ranked = drivers
    .map((driver) => ({ driver, score: driverScore(driver, q) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
  if (!ranked.length) return null
  if (ranked.length === 1 || ranked[0].score >= 80) return ranked[0].driver
  if (ranked[0].score >= ranked[1].score + 20) return ranked[0].driver
  return null
}

export async function resolveAssignedDriver(input: {
  assigned_driver_id?: string | null
  assigned_employee?: string | null
}): Promise<DriverRecord | null> {
  const drivers = await listDrivers()
  if (!drivers.length) return null
  if (input.assigned_driver_id) {
    const byId = drivers.find((d) => d.id === input.assigned_driver_id)
    if (byId) return byId
  }
  return matchDriver(drivers, input.assigned_employee)
}
