import { logActivity } from '@/services/activity.service'
import { listItineraries, selectItinerary } from '@/services/itinerary.service'
import { getRequest } from '@/services/request.service'
import { AppError, getServiceClient } from '@/services/supabase.server'
import type { ItineraryDay, ItineraryRecord } from '@/types/domain'

type RequestExtras = {
  guest_user_id?: string | null
  assigned_driver_id?: string | null
  assigned_vehicle_id?: string | null
  hotel_options?: string | null
}

function routeParts(day: ItineraryDay) {
  if (day.travel?.from && day.travel?.to) {
    return { origin: day.travel.from, destination: day.travel.to }
  }
  const location = day.location || day.title || `Day ${day.day}`
  if (location.includes('→')) {
    const [origin, destination] = location.split('→').map((part) => part.trim())
    return { origin: origin || null, destination: destination || location }
  }
  return { origin: null as string | null, destination: location }
}

async function materializeCompanionTrip(requestId: string, selected: ItineraryRecord) {
  const supabase = getServiceClient()
  const request = (await getRequest(requestId)) as typeof request & RequestExtras
  const days = selected.payload.days || []
  if (!days.length) {
    throw new AppError('The sold itinerary has no days to publish.', 400)
  }

  const vehicleId = selected.vehicle_id || selected.payload.vehicle_id || request.assigned_vehicle_id || null
  let vehicleName: string | null = vehicleId
  if (vehicleId) {
    const { data: vehicle } = await supabase.from('vehicles').select('id, name').eq('id', vehicleId).maybeSingle()
    vehicleName = (vehicle as { name?: string } | null)?.name || vehicleId
  }

  let guestProfileId: string | null = null
  if (request.guest_user_id) {
    const { data: profile } = await supabase.from('app_profiles').select('id').eq('id', request.guest_user_id).maybeSingle()
    guestProfileId = profile?.id ?? null
  }
  let driverId: string | null = null
  if (request.assigned_driver_id) {
    const { data: driver } = await supabase.from('drivers').select('id').eq('id', request.assigned_driver_id).maybeSingle()
    driverId = driver?.id ?? null
  }

  let hotelPayload: unknown = null
  if (request.hotel_options) {
    try {
      hotelPayload = typeof request.hotel_options === 'string' ? JSON.parse(request.hotel_options) : request.hotel_options
    } catch {
      hotelPayload = null
    }
  }

  const tripPayload = {
    request_id: request.id,
    guest_profile_id: guestProfileId,
    driver_id: driverId,
    vehicle_id: vehicleId,
    vehicle_name: vehicleName,
    title: selected.title || request.client_name || 'LankaLux journey',
    guest_display_name: request.client_name,
    start_date: request.start_date,
    end_date: request.end_date,
    status: 'upcoming',
    updated_at: new Date().toISOString(),
  }

  const { data: existing } = await supabase.from('trips').select('id').eq('request_id', request.id).maybeSingle()
  let tripId = (existing as { id?: string } | null)?.id
  if (tripId) {
    const { error } = await supabase.from('trips').update(tripPayload).eq('id', tripId)
    if (error) throw new AppError(error.message || 'Could not update the guest trip.', 500)
  } else {
    const { data: created, error } = await supabase.from('trips').insert(tripPayload).select('id').single()
    if (error || !created) throw new AppError(error?.message || 'Could not create the guest trip.', 500)
    tripId = created.id as string
  }

  if (guestProfileId) {
    await supabase.from('trip_members').upsert(
      { trip_id: tripId, profile_id: guestProfileId, member_role: 'guest' },
      { onConflict: 'trip_id,profile_id' }
    )
  }

  const { error: deleteError } = await supabase.from('trip_days').delete().eq('trip_id', tripId)
  if (deleteError) throw new AppError(deleteError.message || 'Could not replace the published itinerary.', 500)

  for (const [index, day] of days.entries()) {
    const { origin, destination } = routeParts(day)
    const { data: inserted, error } = await supabase
      .from('trip_days')
      .insert({
        trip_id: tripId,
        day_number: day.day || index + 1,
        title: day.title || day.location || `Day ${index + 1}`,
        origin,
        destination,
        summary: day.description || selected.summary || day.location || null,
        hotel_payload: hotelPayload,
      })
      .select('id')
      .single()
    if (error || !inserted) throw new AppError(error?.message || 'Could not publish itinerary days.', 500)
    const activities = Array.isArray(day.activities) ? day.activities.filter(Boolean) : []
    if (activities.length) {
      const { error: stopError } = await supabase.from('trip_stops').insert(
        activities.map((name, sortOrder) => ({
          trip_day_id: inserted.id,
          name,
          kind: 'planned',
          sort_order: sortOrder,
        }))
      )
      if (stopError) throw new AppError(stopError.message || 'Could not publish itinerary stops.', 500)
    }
  }

  await supabase
    .from('Client Requests')
    .update({ app_published_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', request.id)
}

export async function publishSoldItinerary(
  requestId: string,
  soldOption?: 1 | 2 | 3,
  actor?: string
) {
  const all = await listItineraries(requestId)
  const requested = soldOption
    ? all.find((row) => row.option_number === soldOption)
    : all.find((row) => row.is_selected)
  if (!requested || requested.status === 'empty' || !requested.payload?.days?.length) {
    throw new AppError('Choose which itinerary was sold. The guest app will show only that one.', 400)
  }
  if (!requested.is_selected) {
    await selectItinerary(requestId, requested.option_number, actor)
  }
  await materializeCompanionTrip(requestId, requested)
  await logActivity({
    request_id: requestId,
    actor,
    event_type: 'companion_published',
    detail: { option_number: requested.option_number, title: requested.title },
  })
}
