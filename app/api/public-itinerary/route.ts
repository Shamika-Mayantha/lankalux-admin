import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// This is a PUBLIC API endpoint - no authentication required
// It uses the service role key to bypass RLS for public itinerary access
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const token = searchParams.get('token')
    const option = searchParams.get('option')

    if (!token) {
      return NextResponse.json(
        { error: 'Token is required' },
        { status: 400 }
      )
    }

    // Use service role key to bypass RLS for public access
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Missing Supabase environment variables')
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    // Fetch the request by public_token (include sent_options and status)
    const { data, error } = await supabase
      .from('requests')
      .select('id, client_name, start_date, end_date, duration, itineraryoptions, selected_option, sent_options, status')
      .eq('public_token', token)
      .single()

    if (error || !data) {
      console.error('Error fetching itinerary:', error)
      return NextResponse.json(
        { error: 'Itinerary not found' },
        { status: 404 }
      )
    }

    // Check if trip is cancelled
    if (data.status === 'cancelled') {
      return NextResponse.json(
        { error: 'This itinerary has been cancelled' },
        { status: 410 } // 410 Gone - resource is no longer available
      )
    }

    // If option parameter is provided, check sent_options first for snapshot data
    if (option !== null) {
      const optionIndex = parseInt(option, 10)
      if (!isNaN(optionIndex)) {
        // Check if this option was sent and has snapshot data
        let sentOptions: any[] = []
        if (data.sent_options) {
          try {
            sentOptions = typeof data.sent_options === 'string' 
              ? JSON.parse(data.sent_options) 
              : data.sent_options
            if (!Array.isArray(sentOptions)) {
              sentOptions = []
            }
          } catch (e) {
            console.error('Error parsing sent_options:', e)
            sentOptions = []
          }
        }

        // Find the sent option with matching index
        const sentOption = sentOptions.find((item: any) => item.option_index === optionIndex)
        
        // If found in sent_options, use the snapshot data (preserves old links even after regeneration)
        if (sentOption && sentOption.itinerary_data) {
          return NextResponse.json({
            request: {
              id: data.id,
              client_name: data.client_name,
              start_date: data.start_date,
              end_date: data.end_date,
              duration: data.duration,
              selected_option: data.selected_option
            },
            itinerary: sentOption.itinerary_data
          })
        }

        // Otherwise, try to get from current itineraryoptions
        let itineraryOptions = data.itineraryoptions
        if (typeof itineraryOptions === 'string') {
          try {
            itineraryOptions = JSON.parse(itineraryOptions)
          } catch (e) {
            console.error('Error parsing itineraryoptions:', e)
            return NextResponse.json(
              { error: 'Invalid itinerary data' },
              { status: 500 }
            )
          }
        }

        if (itineraryOptions?.options?.[optionIndex]) {
          return NextResponse.json({
            request: {
              id: data.id,
              client_name: data.client_name,
              start_date: data.start_date,
              end_date: data.end_date,
              duration: data.duration,
              selected_option: data.selected_option
            },
            itinerary: itineraryOptions.options[optionIndex]
          })
        }
      }
    }

    // Parse itineraryoptions if it's a string (for backward compatibility when no option specified)
    let itineraryOptions = data.itineraryoptions
    if (typeof itineraryOptions === 'string') {
      try {
        itineraryOptions = JSON.parse(itineraryOptions)
      } catch (e) {
        console.error('Error parsing itineraryoptions:', e)
        return NextResponse.json(
          { error: 'Invalid itinerary data' },
          { status: 500 }
        )
      }
    }

    // Otherwise, return all options (for backward compatibility)
    return NextResponse.json({
      request: {
        id: data.id,
        client_name: data.client_name,
        start_date: data.start_date,
        end_date: data.end_date,
        duration: data.duration,
        selected_option: data.selected_option
      },
      itineraryOptions: itineraryOptions
    })
  } catch (error) {
    console.error('Unexpected error in public itinerary API:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
