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

IMPORTANT: Generate FRESH, UNIQUE, and CREATIVE itinerary options. Do NOT repeat previous suggestions. Create completely new and different experiences each time. Vary the themes, locations, activities, and focus areas significantly.

Requirements:
- Generate EXACTLY 3 distinct luxury itinerary options
- Each option must be premium, bespoke, and professionally curated
- Each option must have MINIMUM 6 days
- Use consistent location names: Colombo, Sigiriya, Ella, Yala, Galle, Kandy, Nuwara Eliya
- Include clear location field for each day
- Activities must be an array of strings (include 4-6 main activities per day)
- CRITICAL: Each activity MUST include a timestamp in the format "HH:MM - Activity description" (e.g., "09:00 - Morning breakfast at hotel", "14:30 - Guided tour of ancient temple")
- Create a proper, professional itinerary plan with realistic timing:
  * Morning activities: 08:00-12:00
  * Afternoon activities: 12:00-17:00
  * Evening activities: 17:00-21:00
  * Include travel times between locations when applicable
  * Ensure logical flow and realistic scheduling
- Each day MUST include:
  * "what_to_expect": A detailed paragraph (3-4 sentences) describing what the client will experience, see, and feel on this day. Include cultural context, highlights, and what makes this day special. Make it professional and informative.
  * "optional_activities": An array of 2-4 optional activities that can be done if time allows (e.g., spa treatments, additional tours, special dining experiences, adventure activities). Format as "HH:MM - Activity description" or just "Activity description" if time-flexible.
- Keep tone elegant, premium, and professional
- Ensure logical travel flow between destinations
- Make activities detailed, specific, and realistic (not generic)
- Create a comprehensive, well-structured itinerary that reads like a professional travel plan
- Make each option diverse (e.g., cultural heritage, wildlife & nature, beach & relaxation, adventure, wellness/ayurveda)
- VARY the themes, focus areas, and experiences significantly from any previous suggestions
- Be creative and offer unique perspectives on Sri Lanka travel
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

CRITICAL: Return ONLY valid JSON. No markdown. No explanation. No code blocks. Only JSON.

Format your response as a valid JSON object with this exact structure:
{
  "options": [
    {
      "title": "Option title (e.g., 'Cultural Heritage & Hill Country Luxury')",
      "summary": "Short elegant overview paragraph (3-4 lines)",
      "days": [
        {
          "day": 1,
          "title": "Arrival in Colombo",
          "location": "Colombo",
          "activities": [
            "14:00 - Airport meet and greet with private chauffeur",
            "14:30 - Private transfer to luxury hotel in Colombo",
            "15:30 - Hotel check-in and welcome refreshments",
            "16:00 - Relax and unwind at hotel facilities",
            "19:00 - Welcome dinner at hotel restaurant"
          ],
          "what_to_expect": "A warm welcome upon arrival with personalized service. Your private chauffeur will assist with luggage and provide insights about your journey ahead. Settle into your luxury accommodation and prepare for an extraordinary experience.",
          "optional_activities": [
            "18:00 - Sunset cruise in Colombo harbor (if time allows)",
            "20:00 - Evening spa treatment at hotel (if time allows)",
            "19:30 - Dinner at a fine dining restaurant (if time allows)"
          ]
        },
        {
          "day": 2,
          "title": "Explore Colombo",
          "location": "Colombo",
          "activities": [
            "09:00 - Breakfast at hotel",
            "10:00 - Guided city tour of Colombo's historic districts",
            "12:30 - Lunch at a local restaurant",
            "14:00 - Visit Pettah local markets for authentic shopping",
            "16:00 - Return to hotel for rest",
            "19:00 - Evening at leisure (dinner recommendations provided)"
          ],
          "what_to_expect": "Discover the vibrant capital city with its blend of colonial architecture and modern developments. Experience the local culture, cuisine, and shopping opportunities.",
          "optional_activities": [
            "15:00 - Visit Gangaramaya Temple (if time allows)",
            "17:00 - Shopping at Odel or Barefoot (if time allows)",
            "16:00 - Cooking class experience (if time allows)"
          ]
        }
      ]
    },
    {
      "title": "Option title (e.g., 'Wildlife Safari & Beach Retreat')",
      "summary": "Short elegant overview paragraph (3-4 lines)",
      "days": [
        {
          "day": 1,
          "title": "Arrival",
          "location": "Colombo",
          "activities": [
            "09:00 - Activity 1 with timestamp",
            "14:00 - Activity 2 with timestamp"
          ],
          "what_to_expect": "Professional description of what to expect on this day (3-4 sentences with cultural context)",
          "optional_activities": [
            "16:00 - Optional activity 1 (if time allows)",
            "18:00 - Optional activity 2 (if time allows)"
          ]
        }
      ]
    },
    {
      "title": "Option title (e.g., 'Adventure & Wellness Journey')",
      "summary": "Short elegant overview paragraph (3-4 lines)",
      "days": [
        {
          "day": 1,
          "title": "Arrival",
          "location": "Colombo",
          "activities": [
            "09:00 - Activity 1 with timestamp",
            "14:00 - Activity 2 with timestamp"
          ],
          "what_to_expect": "Professional description of what to expect on this day (3-4 sentences with cultural context)",
          "optional_activities": [
            "16:00 - Optional activity 1 (if time allows)",
            "18:00 - Optional activity 2 (if time allows)"
          ]
        }
      ]
    }
  ]
}

IMPORTANT RULES:
- Minimum 6 days per option
- Location names must be one of: Colombo, Sigiriya, Ella, Yala, Galle, Kandy, Nuwara Eliya
- Activities must be an array of strings
- Return ONLY the JSON object, no additional text before or after
- No markdown formatting
- No explanations
- Only valid JSON`

    // Generate itinerary using OpenAI
    // Use higher temperature for more variety and creativity
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            'You are a luxury travel consultant specializing in bespoke Sri Lanka experiences. Create premium, curated itineraries with clear structure. Always generate FRESH, UNIQUE, and CREATIVE options that differ significantly from previous suggestions. Always respond with valid JSON only. Never use markdown. Never add explanations. Return only the JSON object.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.9, // Increased from 0.7 to 0.9 for more variety and creativity
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
      // Remove any markdown code blocks if present
      let cleanedContent = generatedContent
      if (cleanedContent.startsWith('```')) {
        cleanedContent = cleanedContent.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
      }
      
      itineraryOptions = JSON.parse(cleanedContent)
      
      // Validate structure
      if (!itineraryOptions.options || !Array.isArray(itineraryOptions.options) || itineraryOptions.options.length !== 3) {
        return NextResponse.json(
          { success: false, error: 'Invalid itinerary format: expected 3 options' },
          { status: 500 }
        )
      }

      // Validate each option has the correct structure
      for (const option of itineraryOptions.options) {
        if (!option.title || !option.summary || !Array.isArray(option.days)) {
          return NextResponse.json(
            { success: false, error: 'Invalid itinerary format: missing required fields' },
            { status: 500 }
          )
        }
        if (option.days.length < 6) {
          return NextResponse.json(
            { success: false, error: 'Invalid itinerary format: minimum 6 days required' },
            { status: 500 }
          )
        }
        // Validate each day has required fields
        for (const day of option.days) {
          if (!day.day || !day.title || !day.location || !Array.isArray(day.activities)) {
            return NextResponse.json(
              { success: false, error: 'Invalid itinerary format: day structure invalid' },
              { status: 500 }
            )
          }
        }
      }
    } catch (parseError) {
      console.error('Error parsing JSON:', parseError)
      console.error('Generated content:', generatedContent)
      return NextResponse.json(
        { success: false, error: 'Failed to parse itinerary response' },
        { status: 500 }
      )
    }

    // Convert JSON object to string and save to itineraryoptions column
    const itineraryOptionsString = JSON.stringify(itineraryOptions)
    
    // Clear selected_option and public_token when regenerating since new options will have different indices
    // This ensures fresh links for new options and prevents using old selections
    const { error: updateError } = await supabase
      .from('requests')
      .update({ 
        itineraryoptions: itineraryOptionsString,
        selected_option: null,
        public_token: null, // Clear public token so new one is generated when option is selected
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
