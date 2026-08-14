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
  sendOptions?: Record<string, unknown>
}): Promise<{ token: string; url: string; journey: CanonicalJourney }> {
  const journey = await getPublishedItinerary(opts.requestId)
  const token = makeShareToken()
  const snapshot: CanonicalJourney = { ...journey, shareToken: token }
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
