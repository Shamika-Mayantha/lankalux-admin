import { NextResponse } from 'next/server'
import { mapWebsiteLead } from '@/lib/website-lead'
import { clientIp, isRateLimited } from '@/lib/rate-limit'
import { describeTrafficSource } from '@/lib/traffic-source'
import { createWebsiteRequest, IntakeError } from '@/services/request-intake.service'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

function withCors(res: NextResponse) {
  Object.entries(corsHeaders).forEach(([k, v]) => res.headers.set(k, v))
  return res
}

export async function POST(request: Request) {
  try {
    if (isRateLimited(`requests:${clientIp(request)}`, 10, 10 * 60 * 1000)) {
      return withCors(NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 }))
    }
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const lead = mapWebsiteLead(body)

    if (!lead.client_name || !lead.email) {
      return withCors(NextResponse.json({ success: false, error: 'name and email are required' }, { status: 400 }))
    }

    const requestId = await createWebsiteRequest(lead, describeTrafficSource(body.attribution))
    return withCors(NextResponse.json({ success: true, requestId, idMode: 'sequential' }, { status: 200 }))
  } catch (err) {
    return withCors(
      NextResponse.json(
        { success: false, error: err instanceof Error ? err.message : 'Unknown error' },
        { status: err instanceof IntakeError ? err.status : 500 }
      )
    )
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders })
}
