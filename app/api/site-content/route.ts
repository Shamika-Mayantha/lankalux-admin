import { NextResponse } from 'next/server'
import { getPublishedSiteContent } from '@/services/website-content.service'

/**
 * Public, read-only feed for lankalux.com: visible reviews and photo overrides.
 * Editing lives behind the admin login under /api/v2/website/*.
 */

export const dynamic = 'force-dynamic'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders })
}

export async function GET() {
  try {
    const content = await getPublishedSiteContent()
    return NextResponse.json(
      { success: true, ...content },
      {
        headers: {
          ...corsHeaders,
          // Edge-cache briefly so admin edits show up within about a minute.
          'Cache-Control': 'public, max-age=0, s-maxage=60, stale-while-revalidate=300',
        },
      },
    )
  } catch (err) {
    console.error('[api/site-content]', err)
    return NextResponse.json(
      { success: false, error: 'Content unavailable' },
      { status: 503, headers: { ...corsHeaders, 'Cache-Control': 'no-store' } },
    )
  }
}
