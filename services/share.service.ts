import { randomBytes } from 'crypto'
import { publicJourneyUrl } from '@/config/env'
import { logActivity } from '@/services/activity.service'
import { getPublishedItinerary } from '@/services/itinerary.service'
import { getServiceClient, AppError, isMissingTableError } from '@/services/supabase.server'
import type { CanonicalJourney } from '@/types/domain'

export function makeShareToken() {
  return `${Date.now().toString(36)}-${randomBytes(9).toString('base64url')}`
}

type SendOptions = {
  channel?: string
  includeHotels?: boolean
  includeVehicle?: boolean
  vehicle?: CanonicalJourney['vehicle']
  includePrice?: boolean
  price?: string | null
}

function buildSnapshot(journey: CanonicalJourney, sendOptions?: SendOptions): CanonicalJourney {
  return {
    ...journey,
    vehicle:
      sendOptions?.includeVehicle === false
        ? null
        : sendOptions?.vehicle !== undefined
          ? sendOptions.vehicle
          : journey.vehicle,
    price: sendOptions?.includePrice
      ? String(sendOptions.price || journey.price || '').trim() || null
      : null,
  }
}

/** JSON with sorted keys and no share token, so a stored jsonb snapshot compares equal to a fresh one. */
function snapshotKey(journey: CanonicalJourney): string {
  const rest: Partial<CanonicalJourney> = { ...journey }
  delete rest.shareToken
  const sort = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(sort)
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.keys(value as Record<string, unknown>)
          .sort()
          .map((k) => [k, sort((value as Record<string, unknown>)[k])])
      )
    }
    return value
  }
  return JSON.stringify(sort(JSON.parse(JSON.stringify(rest))))
}

export async function createShareLink(opts: {
  requestId: string
  actor?: string
  journey?: CanonicalJourney
  sendOptions?: SendOptions
}): Promise<{ token: string; url: string; journey: CanonicalJourney }> {
  const journey = opts.journey || (await getPublishedItinerary(opts.requestId))
  const token = makeShareToken()
  const snapshot: CanonicalJourney = {
    ...buildSnapshot(journey, opts.sendOptions),
    shareToken: token,
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

  return { token, url: journeyUrl(token), journey: snapshot }
}

export function journeyUrl(token: string) {
  return `${publicJourneyUrl()}/journey/${token}`
}

export async function latestShareToken(requestId: string): Promise<string | null> {
  return (await latestShareLink(requestId))?.token ?? null
}

async function latestShareLink(
  requestId: string
): Promise<{ token: string; snapshot: CanonicalJourney | null } | null> {
  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from('share_links')
    .select('token, itinerary_snapshot')
    .eq('request_id', requestId)
    .is('revoked_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error && !isMissingTableError(error)) return null
  if (!data?.token) return null
  return { token: String(data.token), snapshot: (data.itinerary_snapshot as CanonicalJourney) || null }
}

/** Reuse the latest share URL, or create one when none exists / when send options differ. */
export async function getOrCreateShareLink(opts: {
  requestId: string
  actor?: string
  forceNew?: boolean
  sendOptions?: SendOptions
}): Promise<{ token: string; url: string; journey: CanonicalJourney; created: boolean }> {
  const hasCustomSend =
    !!opts.sendOptions &&
    (opts.sendOptions.includeVehicle !== undefined ||
      opts.sendOptions.includePrice !== undefined ||
      opts.sendOptions.vehicle !== undefined ||
      opts.sendOptions.price !== undefined ||
      opts.sendOptions.includeHotels !== undefined)

  const journey = await getPublishedItinerary(opts.requestId)

  // Reuse the latest link only while it still shows the itinerary as saved now.
  // Links are snapshots, so after an edit or a new selection the old link would
  // open the previous itinerary.
  if (!opts.forceNew && !hasCustomSend) {
    const existing = await latestShareLink(opts.requestId)
    if (existing?.snapshot && snapshotKey(existing.snapshot) === snapshotKey(buildSnapshot(journey))) {
      return {
        token: existing.token,
        url: journeyUrl(existing.token),
        journey: { ...journey, shareToken: existing.token },
        created: false,
      }
    }
  }

  const share = await createShareLink({ ...opts, journey })
  return { ...share, created: true }
}
