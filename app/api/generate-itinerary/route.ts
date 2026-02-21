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

    let passengerInfo = 'Not specified'
    if (requestData.number_of_adults || requestData.number_of_children) {
      const adults = requestData.number_of_adults || 0
      const children = requestData.number_of_children || 0
      let childrenInfo = ''
      
      if (children > 0 && requestData.children_ages) {
        try {
          const ages = JSON.parse(requestData.children_ages)
          if (Array.isArray(ages) && ages.length > 0) {
            childrenInfo = ` (${children} child${children > 1 ? 'ren' : ''} aged ${ages.join(', ')} year${ages.length > 1 ? 's' : ''})`
          } else if (children === 1) {
            childrenInfo = ` (1 child)`
          }
        } catch {
          if (children > 0) {
            childrenInfo = ` (${children} child${children > 1 ? 'ren' : ''})`
          }
        }
      } else if (children > 0) {
        childrenInfo = ` (${children} child${children > 1 ? 'ren' : ''})`
      }
      
      passengerInfo = `Adults: ${adults}${childrenInfo}`
    }

    const prompt = `You are a luxury travel consultant specializing in bespoke Sri Lanka experiences. Generate exactly 3 distinct, premium itinerary options for the following client:

Client Name: ${requestData.client_name || 'Not specified'}
Origin Country: ${requestData.origin_country || 'Not specified'}
Start Date: ${startDateFormatted}
End Date: ${endDateFormatted}
Duration: ${requestData.duration || 'Not specified'} days
${passengerInfo}
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
${requestData.number_of_children && requestData.number_of_children > 0 ? (() => {
  let childInfo = `- IMPORTANT: Consider child-friendly activities and accommodations suitable for ${requestData.number_of_children} child${requestData.number_of_children > 1 ? 'ren' : ''}`
  if (requestData.children_ages) {
    try {
      const ages = JSON.parse(requestData.children_ages)
      if (Array.isArray(ages) && ages.length > 0) {
        childInfo += ` (ages: ${ages.join(', ')} years)`
      }
    } catch {}
  }
  return childInfo
})() : ''}
${requestData.number_of_adults && requestData.number_of_adults + (requestData.number_of_children || 0) > 2 ? `- Consider group activities and accommodations suitable for ${(requestData.number_of_adults || 0) + (requestData.number_of_children || 0)} total passengers` : ''}

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

    // Convert JSON object to string and save to itineraryoptions column
    const itineraryOptionsString = JSON.stringify(itineraryOptions)
    
    // Clear selected_option when regenerating since new options will have different indices
    const { error: updateError } = await supabase
      .from('requests')
      .update({ 
        itineraryoptions: itineraryOptionsString,
        selected_option: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', requestId)

    if (updateError) {
      console.error('Error updating itineraryoptions:', updateError)
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
