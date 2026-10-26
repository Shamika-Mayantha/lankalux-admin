import crypto from 'node:crypto'
import { NextResponse } from 'next/server'
import { purgeExpiredJourneyLinks } from '@/services/itinerary.service'

export const maxDuration = 60

/** Daily cleanup of long-expired journey links, called by Vercel Cron with `Authorization: Bearer $CRON_SECRET`. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim()
  const given = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  const ok =
    Boolean(secret) &&
    given.length === secret!.length &&
    crypto.timingSafeEqual(Buffer.from(given), Buffer.from(secret!))
  if (!ok) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  try {
    const result = await purgeExpiredJourneyLinks()
    return NextResponse.json({ success: true, ...result })
  } catch (err) {
    console.error('[cron/journey-cleanup]', err)
    return NextResponse.json({ success: false, error: 'Cleanup failed.' }, { status: 500 })
  }
}
