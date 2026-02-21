import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { supabase } from '@/lib/supabase'

export async function POST(request: Request) {
  try {
    // Parse request body
    const body = await request.json()
    const { id: requestId } = body

    // Validate request ID
    if (!requestId || typeof requestId !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Request ID is required' },
        { status: 400 }
      )
    }

    // Validate OpenAI API key
    const openaiApiKey = process.env.OPENAI_API_KEY
    if (!openaiApiKey) {
      console.error('OPENAI_API_KEY is not configured')
      return NextResponse.json(
        { success: false, error: 'OpenAI API key is not configured' },
        { status: 500 }
      )
    }

    // Initialize OpenAI client
    const openai = new OpenAI({
      apiKey: openaiApiKey,
    })

    // Fetch request details from database
    const { data, error: fetchError } = await supabase
      .from('requests')
      .select('*')
      .eq('id', requestId)
      .single()

    if (fetchError) {
      console.error('Error fetching request:', fetchError)
      return NextResponse.json(
        { success: false, error: 'Failed to fetch request details' },
        { status: 404 }
      )
    }

    const requestData = data as any

    if (!requestData) {
      return NextResponse.json(
        { success: false, error: 'Request not found' },
        { status: 404 }
      )
    }

    // Build prompt for OpenAI
    const prompt = `Generate 2-3 structured luxury travel itineraries for Sri Lanka based on the following request details:

Client Name: ${requestData.client_name || 'Not specified'}
Travel Dates: ${requestData.travel_dates || 'Not specified'}
Duration: ${requestData.duration || 'Not specified'}
Origin Country: ${requestData.origin_country || 'Not specified'}
Additional Details: ${requestData.details || 'None provided'}

Requirements:
- Create 2-3 distinct luxury itinerary options
- Each option should be clearly labeled as "OPTION 1:", "OPTION 2:", and optionally "OPTION 3:"
- Include a day-by-day breakdown for each option
- Focus on luxury experiences, premium accommodations, and exclusive activities
- Consider the travel dates and duration provided
- Include specific locations, activities, and recommendations
- Format each day clearly with:
  - Day number and location
  - Morning activities
  - Afternoon activities
  - Evening experiences
  - Recommended accommodations (luxury hotels/resorts)
- Make the itineraries diverse (e.g., cultural, adventure, beach/relaxation, wildlife)
- Use clear formatting with line breaks and sections

Format the response as plain text with clear sections separated by line breaks.`

    // Generate itinerary using OpenAI
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            'You are a luxury travel consultant specializing in Sri Lanka. Create detailed, well-structured itineraries with clear formatting.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 2000,
    })

    const generatedItinerary =
      completion.choices[0]?.message?.content?.trim() || ''

    if (!generatedItinerary) {
      return NextResponse.json(
        { success: false, error: 'Failed to generate itinerary' },
        { status: 500 }
      )
    }

    // Save generated itinerary to database
    const { error: updateError } = await (supabase.from('requests') as any)
      .update({ itinerary: generatedItinerary })
      .eq('id', requestId)

    if (updateError) {
      console.error('Error updating itinerary:', updateError)
      return NextResponse.json(
        { success: false, error: 'Failed to save itinerary' },
        { status: 500 }
      )
    }

    // Return success response
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Unexpected error generating itinerary:', error)
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'An unexpected error occurred',
      },
      { status: 500 }
    )
  }
}
