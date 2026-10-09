import crypto from 'node:crypto'
import { NextResponse } from 'next/server'
import { listTripReminders, sendTripReminders } from '@/services/trip-reminder.service'

export const maxDuration = 60

/**
 * Evening-before trip emails to guests, called by Vercel Cron (vercel.json) at 19:00 Sri Lanka
 * time with `Authorization: Bearer $CRON_SECRET`. `?preview=1` lists tonight's emails without sending.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim()
  const given = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  const ok =
    Boolean(secret) &&
    given.length === secret!.length &&
    crypto.timingSafeEqual(Buffer.from(given), Buffer.from(secret!))
  if (!ok) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  try {
    if (new URL(request.url).searchParams.get('preview') === '1') {
      const due = await listTripReminders()
      return NextResponse.json({ success: true, due: due.map(({ tripId, to, dayNumber, subject }) => ({ tripId, to, dayNumber, subject })) })
    }
    const result = await sendTripReminders()
    return NextResponse.json({ success: true, ...result })
  } catch (err) {
    console.error('[cron/trip-reminders]', err)
    return NextResponse.json({ success: false, error: 'Trip reminder run failed.' }, { status: 500 })
  }
}
