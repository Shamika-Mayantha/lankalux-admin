import { NextResponse } from 'next/server'
import { clientIp, isRateLimited } from '@/lib/rate-limit'
import { getConciergeState, handleGuestMessage, isSessionId, MAX_MESSAGE_CHARS } from '@/services/concierge.service'

/**
 * Public endpoint for the chat on lankalux.com.
 * GET ?session=…  restores the chat and says whether the concierge is on.
 * POST { sessionId, message, page?, attribution? }  sends a guest message and returns the reply.
 */

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const SITE_ORIGINS = [/^https:\/\/(www\.)?lankalux\.com$/, /^https:\/\/[a-z0-9-]+\.vercel\.app$/, /^http:\/\/localhost:\d+$/]

function cors(request: Request): Record<string, string> {
  const origin = request.headers.get('origin') || ''
  return {
    'Access-Control-Allow-Origin': SITE_ORIGINS.some((re) => re.test(origin)) ? origin : 'https://www.lankalux.com',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
    Vary: 'Origin',
  }
}

function reply(request: Request, body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: cors(request) })
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: cors(request) })
}

export async function GET(request: Request) {
  const session = new URL(request.url).searchParams.get('session')
  if (!isSessionId(session)) return reply(request, { success: false, error: 'Invalid session' }, 400)
  try {
    return reply(request, { success: true, ...(await getConciergeState(session)) })
  } catch (err) {
    console.error('[api/concierge] GET', err)
    return reply(request, { success: false, error: 'Chat unavailable' }, 503)
  }
}

export async function POST(request: Request) {
  if (isRateLimited(`concierge:${clientIp(request)}`, 30, 10 * 60 * 1000)) {
    return reply(request, { success: false, error: 'Too many messages. Please wait a few minutes and try again.' }, 429)
  }
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const text = typeof body.message === 'string' ? body.message.trim() : ''
  if (!isSessionId(body.sessionId)) return reply(request, { success: false, error: 'Invalid session' }, 400)
  if (!text) return reply(request, { success: false, error: 'Empty message' }, 400)
  if (text.length > MAX_MESSAGE_CHARS) return reply(request, { success: false, error: 'That message is too long.' }, 400)
  const page = typeof body.page === 'string' && body.page.startsWith('/') ? body.page.slice(0, 200) : null
  try {
    const result = await handleGuestMessage({ sessionId: body.sessionId, text, page, attribution: body.attribution })
    return reply(request, { success: true, ...result })
  } catch (err) {
    console.error('[api/concierge] POST', err)
    return reply(request, { success: false, error: 'Chat unavailable' }, 503)
  }
}
