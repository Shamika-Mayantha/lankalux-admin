import { randomBytes } from 'crypto'
import { appUrl } from '@/config/env'
import { logActivity } from '@/services/activity.service'
import { getPublishedItinerary } from '@/services/itinerary.service'
import { getServiceClient, AppError, isMissingTableError } from '@/services/supabase.server'
import type { CanonicalJourney } from '@/types/domain'

export function makeShareToken() {
  return `${Date.now().toString(36)}-${randomBytes(9).toString('base64url')}`
}

export async function createShareLink(opts: {
  requestId: string
  actor?: string
  sendOptions?: {
    channel?: string
    includeHotels?: boolean
    includeVehicle?: boolean
    vehicle?: CanonicalJourney['vehicle']
    includePrice?: boolean
    price?: string | null
  }
}): Promise<{ token: string; url: string; journey: CanonicalJourney }> {
  const journey = await getPublishedItinerary(opts.requestId)
  const token = makeShareToken()
  const snapshot: CanonicalJourney = {
    ...journey,
    shareToken: token,
    vehicle:
      opts.sendOptions?.includeVehicle === false
        ? null
        : opts.sendOptions?.vehicle !== undefined
          ? opts.sendOptions.vehicle
          : journey.vehicle,
    price: opts.sendOptions?.includePrice
      ? String(opts.sendOptions.price || journey.price || '').trim() || null
      : null,
  }
  const supabase = getServiceClient()

  const { error } = await supabase.from('share_links').insert({
    token,
    request_id: opts.requestId,
    itinerary_id: null,
    itinerary_snapshot: snapshot,
    send_options: opts.sendOptions || {},
    created_by: opts.actor || null,
  })

  if (error && !isMissingTableError(error)) {
    throw new AppError(`Supabase request failed: ${error.message}`, 500)
  }
  if (error && isMissingTableError(error)) {
    throw new AppError(
      'Share links table is missing. Run supabase/migrations/20260814000000_console_v2_foundation.sql in the Supabase SQL editor, then try again.',
      500
    )
  }

  await logActivity({
    request_id: opts.requestId,
    actor: opts.actor,
    event_type: 'share_link_created',
    detail: { token },
  })

  return { token, url: `${appUrl()}/journey/${token}`, journey: snapshot }
}

export function journeyUrl(token: string) {
  return `${appUrl()}/journey/${token}`
}

export async function latestShareToken(requestId: string): Promise<string | null> {
  const supabase = getServiceClient()
  const { data, error } = await supabase
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

/** Reuse the latest share URL, or create one when none exists / when send options differ. */
export async function getOrCreateShareLink(opts: {
  requestId: string
  actor?: string
  forceNew?: boolean
  sendOptions?: {
    channel?: string
    includeHotels?: boolean
    includeVehicle?: boolean
    vehicle?: CanonicalJourney['vehicle']
    includePrice?: boolean
    price?: string | null
  }
}): Promise<{ token: string; url: string; journey: CanonicalJourney; created: boolean }> {
  const hasCustomSend =
    !!opts.sendOptions &&
    (opts.sendOptions.includeVehicle !== undefined ||
      opts.sendOptions.includePrice !== undefined ||
      opts.sendOptions.vehicle !== undefined ||
      opts.sendOptions.price !== undefined ||
      opts.sendOptions.includeHotels !== undefined)

  if (!opts.forceNew && !hasCustomSend) {
    const existing = await latestShareToken(opts.requestId)
    if (existing) {
      const journey = await getPublishedItinerary(opts.requestId)
      return {
        token: existing,
        url: journeyUrl(existing),
        journey: { ...journey, shareToken: existing },
        created: false,
      }
    }
  }

  const share = await createShareLink(opts)
  return { ...share, created: true }
}
