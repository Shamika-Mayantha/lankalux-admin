import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'

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

    // Validate environment variables
    if (!process.env.OPENAI_API_KEY) {
      console.error('Missing OPENAI_API_KEY')
      return NextResponse.json({ error: 'Missing OpenAI key' }, { status: 500 })
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('Missing SUPABASE_SERVICE_ROLE_KEY')
      return NextResponse.json(
        { error: 'Missing Supabase service key' },
        { status: 500 }
      )
    }

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      console.error('Missing SUPABASE_URL')
      return NextResponse.json(
        { error: 'Missing Supabase URL' },
        { status: 500 }
      )
    }

    // Initialize server-side Supabase client
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    // Initialize OpenAI client
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
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
    const startDateFormatted = requestData.start_date 
      ? new Date(requestData.start_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
      : 'Not specified'
    const endDateFormatted = requestData.end_date 
      ? new Date(requestData.end_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
      : 'Not specified'

    const prompt = `You are a luxury travel consultant specializing in bespoke Sri Lanka experiences. Generate exactly 3 distinct, premium itinerary options for the following client:

Client Name: ${requestData.client_name || 'Not specified'}
Origin Country: ${requestData.origin_country || 'Not specified'}
Start Date: ${startDateFormatted}
End Date: ${endDateFormatted}
Duration: ${requestData.duration || 'Not specified'} days
Additional Preferences: ${requestData.additional_preferences || 'None provided'}

Requirements:
- Generate EXACTLY 3 distinct luxury itinerary options
- Each option must be premium, bespoke, and curated
- Include day-by-day breakdown for each option
- Suggest specific regions and locations
- Highlight unique experience highlights
- Emphasize luxury positioning and premium accommodations
- Ensure logical travel flow between destinations
- Make each option diverse (e.g., cultural heritage, wildlife & nature, beach & relaxation, adventure, wellness/ayurveda)

Format your response as a valid JSON object with this exact structure:
{
  "options": [
    {
      "title": "Option title (e.g., 'Cultural Heritage & Hill Country Luxury')",
      "days": "Day-by-day breakdown as a formatted string with clear day numbers, locations, activities, and accommodations",
      "summary": "Brief summary highlighting key experiences, regions covered, and luxury positioning"
    },
    {
      "title": "Option title (e.g., 'Wildlife Safari & Beach Retreat')",
      "days": "Day-by-day breakdown as a formatted string with clear day numbers, locations, activities, and accommodations",
      "summary": "Brief summary highlighting key experiences, regions covered, and luxury positioning"
    },
    {
      "title": "Option title (e.g., 'Adventure & Wellness Journey')",
      "days": "Day-by-day breakdown as a formatted string with clear day numbers, locations, activities, and accommodations",
      "summary": "Brief summary highlighting key experiences, regions covered, and luxury positioning"
    }
  ]
}

Return ONLY the JSON object, no additional text before or after.`

    // Generate itinerary using OpenAI
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            'You are a luxury travel consultant specializing in bespoke Sri Lanka experiences. Create premium, curated itineraries with clear structure. Always respond with valid JSON only.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 4000,
      response_format: { type: 'json_object' },
    })

    const generatedContent =
      completion.choices[0]?.message?.content?.trim() || ''

    if (!generatedContent) {
      return NextResponse.json(
        { success: false, error: 'Failed to generate itinerary' },
        { status: 500 }
      )
    }

    // Parse JSON response
    let itineraryOptions
    try {
      itineraryOptions = JSON.parse(generatedContent)
      
      // Validate structure
      if (!itineraryOptions.options || !Array.isArray(itineraryOptions.options) || itineraryOptions.options.length !== 3) {
        return NextResponse.json(
          { success: false, error: 'Invalid itinerary format: expected 3 options' },
          { status: 500 }
        )
      }
    } catch (parseError) {
      console.error('Error parsing JSON:', parseError)
      return NextResponse.json(
        { success: false, error: 'Failed to parse itinerary response' },
        { status: 500 }
      )
    }

    // Save generated itinerary options to database
    const { error: updateError } = await supabase
      .from('requests')
      .update({ itinerary_options: itineraryOptions })
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
