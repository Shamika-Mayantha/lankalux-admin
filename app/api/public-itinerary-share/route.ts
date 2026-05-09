import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const share = searchParams.get('share')

    if (!share) {
      return NextResponse.json({ error: 'Share token is required' }, { status: 400 })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data: shareRow, error: shareError } = await supabase
      .from('itinerary_shares')
      .select('request_id, option_index, itinerary_data, send_options, created_at')
      .eq('share_token', share)
      .single()

    if (shareError || !shareRow) {
      return NextResponse.json({ error: 'Itinerary share not found' }, { status: 404 })
    }

    const { data: reqRow, error: reqError } = await supabase
      .from('Client Requests')
      .select('id, client_name, start_date, end_date, duration, status')
      .eq('id', shareRow.request_id)
      .single()

    if (reqError || !reqRow) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 })
    }

    if ((reqRow as any).status === 'cancelled' || (reqRow as any).status === 'closed') {
      return NextResponse.json({ error: 'This itinerary is no longer available' }, { status: 410 })
    }

    return NextResponse.json({
      request: {
        id: reqRow.id,
        client_name: reqRow.client_name,
        start_date: reqRow.start_date,
        end_date: reqRow.end_date,
        duration: reqRow.duration,
      },
      itinerary: shareRow.itinerary_data,
      send_options: shareRow.send_options || null,
      meta: {
        option_index: shareRow.option_index,
        created_at: shareRow.created_at,
      },
    })
  } catch (err) {
    console.error('public-itinerary-share', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

