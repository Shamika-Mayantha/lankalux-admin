import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/** Record when a client opens the itinerary link. Call from public itinerary page. */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const { token, option: optionParam } = body as { token?: string; option?: string | number }

    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 })
    }

    const optionIndex = optionParam !== undefined && optionParam !== null
      ? (typeof optionParam === 'number' ? optionParam : parseInt(String(optionParam), 10))
      : null

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    const { data: requestRow, error: fetchError } = await supabase
      .from('Client Requests')
      .select('id, link_opens')
      .eq('public_token', token)
      .single()

    if (fetchError || !requestRow) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 })
    }

    type LinkOpen = { opened_at: string; option_index?: number | null }
    let linkOpens: LinkOpen[] = []
    if (requestRow.link_opens) {
      try {
        const parsed = typeof requestRow.link_opens === 'string'
          ? JSON.parse(requestRow.link_opens)
          : requestRow.link_opens
        linkOpens = Array.isArray(parsed) ? parsed : []
      } catch {
        linkOpens = []
      }
    }

    linkOpens.push({
      opened_at: new Date().toISOString(),
      option_index: optionIndex !== null && !isNaN(optionIndex) ? optionIndex : undefined,
    })
    if (linkOpens.length > 100) linkOpens = linkOpens.slice(-100)

    const { error: updateError } = await supabase
      .from('Client Requests')
      .update({
        link_opens: JSON.stringify(linkOpens),
        updated_at: new Date().toISOString(),
      })
      .eq('id', requestRow.id)

    if (updateError) {
      console.error('Error recording link open:', updateError)
      return NextResponse.json({ error: 'Failed to record' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('record-itinerary-open error:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to record' },
      { status: 500 }
    )
  }
}
