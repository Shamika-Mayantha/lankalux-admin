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

    // Fetch the request by public_token
    const { data, error } = await supabase
      .from('requests')
      .select('id, client_name, start_date, end_date, duration, itineraryoptions, selected_option')
      .eq('public_token', token)
      .single()

    if (error || !data) {
      console.error('Error fetching itinerary:', error)
      return NextResponse.json(
        { error: 'Itinerary not found' },
        { status: 404 }
      )
    }

    // Parse itineraryoptions if it's a string
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

    // If option parameter is provided, return that specific option
    if (option !== null) {
      const optionIndex = parseInt(option, 10)
      if (!isNaN(optionIndex) && itineraryOptions?.options?.[optionIndex]) {
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
