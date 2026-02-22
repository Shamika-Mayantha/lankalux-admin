import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { join } from 'path'

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

    // Read photo mapping file to help AI select appropriate images
    let photoMappingInfo = ''
    try {
      const photoMappingPath = join(process.cwd(), 'public', 'images', 'photo-mapping.json')
      const photoMappingContent = readFileSync(photoMappingPath, 'utf-8')
      const photoMapping = JSON.parse(photoMappingContent)
      
      // Format photo mapping for AI prompt
      photoMappingInfo = `\n\n═══════════════════════════════════════════════════════════════\nCRITICAL: PHOTO SELECTION FOR ITINERARY DAYS\n═══════════════════════════════════════════════════════════════\n\nEVERY SINGLE DAY MUST HAVE AN IMAGE that showcases the day's highlight and main experience. This is MANDATORY - no exceptions.\n\nAnalyze each day carefully:\n1. Read the day's title, location, and ALL activities\n2. Identify the PRIMARY HIGHLIGHT or main experience of that day\n3. Select the image that BEST REPRESENTS what the client will see and experience\n4. Choose images that visually showcase the day's most exciting or memorable moments\n\nAVAILABLE PHOTOS:\n\nLOCATION PHOTOS (Primary + Alternatives):\n`
      
      // Add location photos with more detail
      Object.entries(photoMapping.locations).forEach(([location, data]: [string, any]) => {
        photoMappingInfo += `\n📍 ${location}:\n`
        photoMappingInfo += `   Primary: ${data.primary_image}\n`
        if (data.alternative_images && data.alternative_images.length > 0) {
          photoMappingInfo += `   Alternatives: ${data.alternative_images.join(', ')}\n`
        }
        photoMappingInfo += `   Keywords: ${data.keywords.join(', ')}\n`
      })
      
      // Add activity photos with more detail
      photoMappingInfo += `\n\nACTIVITY-SPECIFIC PHOTOS:\n`
      Object.entries(photoMapping.activities).forEach(([activity, data]: [string, any]) => {
        photoMappingInfo += `\n🎯 ${activity.toUpperCase()}:\n`
        photoMappingInfo += `   Images: ${data.images.join(', ')}\n`
        photoMappingInfo += `   Keywords: ${data.keywords.join(', ')}\n`
      })
      
      photoMappingInfo += `\n\n═══════════════════════════════════════════════════════════════\nPHOTO SELECTION STRATEGY:\n═══════════════════════════════════════════════════════════════\n\nFor EACH day, follow this process:\n\nSTEP 1: Identify the Day's Highlight\n- What is the MAIN experience or attraction?\n- What will be the most memorable moment?\n- What visual best represents the day's essence?\n\nSTEP 2: Match to Available Photos\n- If the highlight is location-based → Use location primary or alternative image\n- If the highlight is activity-based → Use activity-specific image\n- If multiple highlights → Choose the image that best represents the PRIMARY experience\n\nSTEP 3: Select the Best Image\n- Safari/wildlife day → Use safari or wildlife images\n- Temple/cultural day → Use temple or cultural images\n- Beach/relaxation day → Use beach images\n- Tea plantation day → Use tea plantation images\n- Train journey day → Use train images\n- Hiking/adventure day → Use hiking/mountain images\n- Dining/food day → Use dining/restaurant images\n- Spa/wellness day → Use spa/wellness images\n\nSTEP 4: Ensure Every Day Has an Image\n- EVERY day MUST have an "image" field\n- NO day should be without a photo\n- If unsure, use the location's primary_image as fallback\n- Default placeholder: ${photoMapping.default_placeholder} (only if absolutely no match)\n\nREMEMBER: The image should make the client EXCITED about that day. It should visually represent what they'll experience and see. Choose images that showcase the highlight of each day!\n\n═══════════════════════════════════════════════════════════════\n`
    } catch (error) {
      console.warn('Could not read photo mapping file:', error)
      // Continue without photo mapping - images will use default location-based mapping
    }

    // Calculate actual duration from dates if duration is not provided
    let actualDuration = requestData.duration
    if (!actualDuration && requestData.start_date && requestData.end_date) {
      const start = new Date(requestData.start_date)
      const end = new Date(requestData.end_date)
      const diffTime = Math.abs(end.getTime() - start.getTime())
      actualDuration = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1 // +1 to include both start and end days
    }

    const prompt = `You are an experienced and passionate luxury travel consultant who creates personalized, memorable journeys through Sri Lanka. Write naturally, as if you're personally crafting this itinerary for a dear friend. Generate exactly 3 distinct, premium itinerary options for the following client:

CLIENT INFORMATION:
- Client Name: ${requestData.client_name || 'Not specified'}
- Origin Country: ${requestData.origin_country || 'Not specified'}
- Travel Start Date: ${startDateFormatted}
- Travel End Date: ${endDateFormatted}
- Total Duration: ${actualDuration || 'Not specified'} days
${passengerInfo}
- Additional Preferences: ${requestData.additional_preferences || 'None provided'}
${photoMappingInfo}

CRITICAL REQUIREMENTS - READ CAREFULLY:
- Generate EXACTLY 3 distinct luxury itinerary options
- Each option must be premium, bespoke, and professionally curated
- Each option MUST have EXACTLY ${actualDuration || 'the specified number of'} days - match the EXACT duration provided above (${actualDuration || requestData.duration || 'Not specified'} days)
- The itinerary must span from ${startDateFormatted} to ${endDateFormatted} - use these EXACT dates
- Use ALL the information provided: travel dates, duration, passenger info, and additional preferences
- Do NOT default to 6 days - use the ACTUAL duration from the client's request
- Plan activities and locations based on the actual number of days available
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
- Each day MUST include (ALL ARE REQUIRED - NO EXCEPTIONS):
  * "image": MANDATORY - Every day must have an image that showcases the day's highlight. Analyze the day's title, location, and activities to identify the PRIMARY experience. Select the image that best visually represents what the client will see and experience on that day. Choose from location photos (primary or alternatives) or activity-specific photos. The image should make the client excited about that day. This field is REQUIRED for every single day - no exceptions.
  * "what_to_expect": Write a warm, engaging paragraph (3-4 sentences) that describes what the client will experience, see, and feel on this day. Write it as if you're personally sharing insights about the day ahead. Include cultural context, highlights, and what makes this day special. Be descriptive and inviting, helping them visualize the experience.
  * "optional_activities": An array of 2-4 optional activities that can be done if time allows (e.g., spa treatments, additional tours, special dining experiences, adventure activities). Format as "HH:MM - Activity description" or just "Activity description" if time-flexible. Write these naturally and conversationally, as friendly suggestions for enhancing their experience. Do not mention any charges or costs - simply present them as wonderful opportunities if they have extra time.
- Keep tone warm, elegant, premium, and human - write as if you're personally guiding them through their journey
- Ensure logical travel flow between destinations
- Make activities detailed, specific, and realistic (not generic)
- Create a comprehensive, well-structured itinerary that reads naturally and feels personal - like a trusted friend sharing their favorite experiences
- Write in a warm, conversational yet elegant style that makes the client excited about their journey
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
          "image": "/images/colombo.jpg",
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
          "image": "/images/colombo-city.jpg",
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
          "image": "/images/colombo.jpg",
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
          "image": "/images/colombo.jpg",
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
- Each option MUST have EXACTLY ${actualDuration || 'the specified number of'} days - use the duration provided in the client information above (${actualDuration || requestData.duration || 'Not specified'} days from ${startDateFormatted} to ${endDateFormatted})
- Location names must be one of: Colombo, Sigiriya, Ella, Yala, Galle, Kandy, Nuwara Eliya
- Activities must be an array of strings
- CRITICAL: EVERY day MUST have an "image" field - this is MANDATORY. No day should be without a photo.
- The "image" field must contain a valid image path from the available photos list
- Analyze each day's highlight and select the image that best showcases what the client will experience
- Return ONLY the JSON object, no additional text before or after
- No markdown formatting
- No explanations
- Only valid JSON`

    // Generate itinerary using OpenAI with retry logic
    // Use higher temperature for more variety and creativity
    let completion
    let generatedContent = ''
    const maxRetries = 3
    let currentMaxTokens = 8000 // Start with 8000 tokens
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        completion = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content:
                'You are a luxury travel consultant specializing in bespoke Sri Lanka experiences. Create premium, curated itineraries with clear structure. Always generate FRESH, UNIQUE, and CREATIVE options that differ significantly from previous suggestions. CRITICAL: Every single day MUST include an "image" field that showcases the day\'s highlight - analyze each day\'s activities and theme to select the most appropriate photo. Always respond with valid JSON only. Never use markdown. Never add explanations. Return only the JSON object. Ensure the JSON is complete and valid. Every day must have an image - no exceptions.',
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          temperature: 0.9, // Increased from 0.7 to 0.9 for more variety and creativity
          max_tokens: currentMaxTokens, // Dynamically increase if truncated
          response_format: { type: 'json_object' },
        })

        generatedContent = completion.choices[0]?.message?.content?.trim() || ''
        
        // Check if response was truncated (indicated by finish_reason)
        const finishReason = completion.choices[0]?.finish_reason
        if (finishReason === 'length') {
          console.warn(`Response was truncated on attempt ${attempt}. Current max_tokens: ${currentMaxTokens}`)
          if (attempt < maxRetries) {
            // Increase max_tokens for retry (double it, up to 16000)
            currentMaxTokens = Math.min(currentMaxTokens * 2, 16000)
            console.log(`Retrying with max_tokens: ${currentMaxTokens}`)
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt))
            continue
          } else {
            console.error('Response still truncated after all retries')
          }
        }
        
        if (generatedContent) {
          break // Success, exit retry loop
        }
      } catch (apiError) {
        console.error(`OpenAI API error on attempt ${attempt}:`, apiError)
        if (attempt === maxRetries) {
          return NextResponse.json(
            { success: false, error: 'Failed to generate itinerary after multiple attempts' },
            { status: 500 }
          )
        }
        // Wait before retry (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt))
      }
    }

    if (!generatedContent) {
      return NextResponse.json(
        { success: false, error: 'Failed to generate itinerary' },
        { status: 500 }
      )
    }

    // Parse JSON response
    let itineraryOptions
    let cleanedContent = ''
    let openBraces = 0
    let closeBraces = 0
    let openBrackets = 0
    let closeBrackets = 0
    
    try {
      // Remove any markdown code blocks if present
      cleanedContent = generatedContent.trim()
      
      // Remove markdown code blocks (handle various formats)
      cleanedContent = cleanedContent.replace(/^```(?:json|JSON)?\n?/gm, '').replace(/\n?```$/gm, '')
      cleanedContent = cleanedContent.trim()
      
      // Try to extract JSON if there's extra text
      const jsonMatch = cleanedContent.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        cleanedContent = jsonMatch[0]
      }
      
      // Remove any leading/trailing whitespace or newlines
      cleanedContent = cleanedContent.trim()
      
      // Check if JSON might be incomplete (common if truncated)
      openBraces = (cleanedContent.match(/\{/g) || []).length
      closeBraces = (cleanedContent.match(/\}/g) || []).length
      
      if (openBraces !== closeBraces) {
        console.warn('JSON appears incomplete - mismatched braces:', { openBraces, closeBraces })
        // Try to fix incomplete JSON by closing braces
        const missingBraces = openBraces - closeBraces
        cleanedContent += '\n' + '}'.repeat(missingBraces)
      }
      
      // Check for incomplete arrays
      openBrackets = (cleanedContent.match(/\[/g) || []).length
      closeBrackets = (cleanedContent.match(/\]/g) || []).length
      if (openBrackets !== closeBrackets) {
        console.warn('JSON appears incomplete - mismatched brackets:', { openBrackets, closeBrackets })
        const missingBrackets = openBrackets - closeBrackets
        cleanedContent += '\n' + ']'.repeat(missingBrackets)
      }
      
      console.log('Attempting to parse JSON. Content length:', cleanedContent.length)
      console.log('First 200 chars:', cleanedContent.substring(0, 200))
      console.log('Last 200 chars:', cleanedContent.substring(Math.max(0, cleanedContent.length - 200)))
      
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
        // Validate that the number of days matches the requested duration
        const expectedDays = actualDuration || requestData.duration
        if (expectedDays && option.days.length !== expectedDays) {
          return NextResponse.json(
            { success: false, error: `Invalid itinerary format: expected ${expectedDays} days but got ${option.days.length} days` },
            { status: 500 }
          )
        }
        // Fallback: minimum 1 day if duration not specified
        if (!expectedDays && option.days.length < 1) {
          return NextResponse.json(
            { success: false, error: 'Invalid itinerary format: itinerary must have at least 1 day' },
            { status: 500 }
          )
        }
        // Validate each day has required fields including image
        for (const day of option.days) {
          if (!day.day || !day.title || !day.location || !Array.isArray(day.activities)) {
            return NextResponse.json(
              { success: false, error: 'Invalid itinerary format: day structure invalid' },
              { status: 500 }
            )
          }
          // Ensure every day has an image - if missing, use location-based fallback
          if (!day.image || typeof day.image !== 'string') {
            console.warn(`Day ${day.day} (${day.title}) is missing image field. Adding fallback.`)
            // Use location-based image as fallback
            const locationImageMap: Record<string, string> = {
              "Colombo": "/images/colombo.jpg",
              "Sigiriya": "/images/sigiriya.jpg",
              "Ella": "/images/ella.jpg",
              "Yala": "/images/yala.jpg",
              "Galle": "/images/galle.jpg",
              "Kandy": "/images/kandy.jpg",
              "Nuwara Eliya": "/images/nuwara-eliya.jpg"
            }
            day.image = locationImageMap[day.location] || "/images/placeholder.jpg"
          }
        }
      }
    } catch (parseError) {
      console.error('Error parsing JSON:', parseError)
      console.error('Parse error details:', {
        message: parseError instanceof Error ? parseError.message : String(parseError),
        name: parseError instanceof Error ? parseError.name : 'Unknown',
        stack: parseError instanceof Error ? parseError.stack : undefined
      })
      console.error('Generated content length:', generatedContent.length)
      console.error('Generated content (first 1000 chars):', generatedContent.substring(0, 1000))
      console.error('Generated content (last 1000 chars):', generatedContent.substring(Math.max(0, generatedContent.length - 1000)))
      
      // Check if content starts with JSON
      const startsWithJson = cleanedContent.trim().startsWith('{')
      const endsWithJson = cleanedContent.trim().endsWith('}')
      
      // Try to provide more helpful error message
      let errorMessage = 'Failed to parse itinerary response'
      let errorDetails: any = {
        parseError: parseError instanceof Error ? parseError.message : String(parseError),
        contentLength: generatedContent.length,
        cleanedLength: cleanedContent.length,
        startsWithJson,
        endsWithJson,
        openBraces,
        closeBraces,
        openBrackets,
        closeBrackets
      }
      
      if (parseError instanceof SyntaxError) {
        // Extract position information from syntax error if available
        const positionMatch = parseError.message.match(/position (\d+)/i)
        if (positionMatch) {
          const position = parseInt(positionMatch[1], 10)
          errorDetails.syntaxErrorPosition = position
          errorDetails.contextAroundError = cleanedContent.substring(
            Math.max(0, position - 100),
            Math.min(cleanedContent.length, position + 100)
          )
        }
        errorMessage = `Invalid JSON format: ${parseError.message}`
      }
      
      // Always include preview in error response for debugging
      errorDetails.contentPreview = {
        first500: generatedContent.substring(0, 500),
        last500: generatedContent.substring(Math.max(0, generatedContent.length - 500)),
        cleanedFirst500: cleanedContent.substring(0, 500),
        cleanedLast500: cleanedContent.substring(Math.max(0, cleanedContent.length - 500))
      }
      
      return NextResponse.json(
        { 
          success: false, 
          error: errorMessage,
          details: errorDetails
        },
        { status: 500 }
      )
    }

    // Convert JSON object to string and save to itineraryoptions column
    const itineraryOptionsString = JSON.stringify(itineraryOptions)
    
    // Clear selected_option when regenerating since new options will have different indices
    // Keep public_token so old sent links remain active (they use snapshot data from sent_options)
    const { error: updateError } = await supabase
      .from('requests')
      .update({ 
        itineraryoptions: itineraryOptionsString,
        selected_option: null, // Clear selection so user must select a new option
        // Keep public_token - don't clear it so old links continue to work
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
