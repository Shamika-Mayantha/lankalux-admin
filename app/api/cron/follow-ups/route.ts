import crypto from 'node:crypto'
import { NextResponse } from 'next/server'
import { sendFollowUpReminders } from '@/services/follow-up.service'

export const maxDuration = 60

/** Daily reminder email, called by Vercel Cron (vercel.json) with `Authorization: Bearer $CRON_SECRET`. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim()
  const given = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  const ok =
    Boolean(secret) &&
    given.length === secret!.length &&
    crypto.timingSafeEqual(Buffer.from(given), Buffer.from(secret!))
  if (!ok) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  try {
    const result = await sendFollowUpReminders()
    return NextResponse.json({ success: true, ...result })
  } catch (err) {
    console.error('[cron/follow-ups]', err)
    return NextResponse.json({ success: false, error: 'Reminder run failed.' }, { status: 500 })
  }
}
