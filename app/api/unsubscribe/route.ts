import { NextResponse } from 'next/server'
import { unsubscribeByToken } from '@/services/unsubscribe.service'

/**
 * PUBLIC: no login. Unsubscribes the address behind a link token, from the button on /unsubscribe or
 * from a mail app's one-click List-Unsubscribe (RFC 8058). Only POST changes anything, so link
 * scanners that open the page never unsubscribe anyone by accident.
 */
export async function POST(request: Request) {
  const url = new URL(request.url)
  let token = url.searchParams.get('t')
  const type = request.headers.get('content-type') || ''
  let fromPage = false
  if (type.includes('application/x-www-form-urlencoded') || type.includes('multipart/form-data')) {
    const form = await request.formData().catch(() => null)
    fromPage = form?.get('from') === 'page'
    token = token || (form?.get('t') as string | null) || null
  }
  try {
    const ok = await unsubscribeByToken(token)
    if (fromPage) return NextResponse.redirect(new URL(`/unsubscribe?t=${encodeURIComponent(token || '')}${ok ? '' : '&bad=1'}`, url), 303)
    return NextResponse.json({ success: ok }, { status: ok ? 200 : 404 })
  } catch (err) {
    console.error('[unsubscribe] failed', err instanceof Error ? err.message : err)
    if (fromPage) return NextResponse.redirect(new URL(`/unsubscribe?t=${encodeURIComponent(token || '')}&error=1`, url), 303)
    return NextResponse.json({ success: false }, { status: 500 })
  }
}
