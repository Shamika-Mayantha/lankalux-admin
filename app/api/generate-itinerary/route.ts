import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { join } from 'path'

// Vercel Hobby plan has 10 second timeout - optimize for speed
export const maxDuration = 10

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
      photoMappingInfo = `\n\n═══════════════════════════════════════════════════════════════\nCRITICAL: PHOTO SELECTION FOR ITINERARY DAYS\n═══════════════════════════════════════════════════════════════\n\n**MANDATORY RULES:**\n1. EVERY SINGLE DAY MUST HAVE AN IMAGE that showcases the day's highlight and main experience\n2. **EACH DAY MUST HAVE A UNIQUE PHOTO - NO REPEATS within the same itinerary option!**\n3. Map photos to the day's MAIN HIGHLIGHT (the primary experience/attraction), not just location\n4. Track which photos you've used - NEVER use the same photo twice in one itinerary\n\n**PHOTO SELECTION PROCESS FOR EACH DAY:**\n1. Read the day's title, location, and ALL activities\n2. Identify the PRIMARY HIGHLIGHT or main experience of that day (what makes this day special)\n3. Select the image that BEST REPRESENTS that highlight\n4. Ensure this photo hasn't been used for another day in this itinerary\n5. If primary image is already used, use alternative_images from that location/activity\n\nAVAILABLE PHOTOS:\n\nLOCATION PHOTOS (Primary + Alternatives):\n`
      
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
      
      photoMappingInfo += `\n\n═══════════════════════════════════════════════════════════════\nPHOTO SELECTION STRATEGY:\n═══════════════════════════════════════════════════════════════\n\nFor EACH day, follow this process:\n\nSTEP 1: Identify the Day's Highlight\n- What is the MAIN experience or attraction?\n- What will be the most memorable moment?\n- What visual best represents the day's essence?\n\nSTEP 2: Match to Available Photos\n- If the highlight is location-based → Use location primary or alternative image\n- If the highlight is activity-based → Use activity-specific image\n- If multiple highlights → Choose the image that best represents the PRIMARY experience\n\nSTEP 3: Select the Best Image\n- Safari/wildlife day → Use safari or wildlife images\n- Temple/cultural day → Use temple or cultural images\n- Beach/relaxation day → Use beach images\n- Tea plantation day → Use tea plantation images\n- Train journey day → Use train images\n- Hiking/adventure day → Use hiking/mountain images\n- Dining/food day → Use dining/restaurant images\n- Spa/wellness day → Use spa/wellness images\n\nSTEP 4: Ensure Every Day Has a UNIQUE Image\n- EVERY day MUST have an "image" field\n- NO day should be without a photo\n- **CRITICAL: Each day must have a DIFFERENT photo - track your usage to avoid repeats**\n- If primary image is already used, use alternative_images from that location/activity\n- If unsure, use the location's primary_image as fallback (but check if already used)\n- Default placeholder: ${photoMapping.default_placeholder} (only if absolutely no match)\n\nREMEMBER: \n- The image should make the client EXCITED about that day\n- It should visually represent what they'll experience and see\n- Choose images that showcase the highlight of each day\n- **MOST IMPORTANT: Each day gets ONE unique photo - no repeats!**\n\n═══════════════════════════════════════════════════════════════\n`
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
${requestData.additional_preferences && requestData.additional_preferences.trim() ? `- **ADDITIONAL PREFERENCES (MANDATORY TO INCORPORATE): ${requestData.additional_preferences}**` : '- Additional Preferences: None provided'}
${photoMappingInfo}

CRITICAL REQUIREMENTS - READ CAREFULLY:
- Generate EXACTLY 3 distinct luxury itinerary options
- Each option must be premium, bespoke, and professionally curated
${requestData.additional_preferences && requestData.additional_preferences.trim() ? `- **MANDATORY: You MUST incorporate the client's additional preferences: "${requestData.additional_preferences}" in ALL 3 options. These preferences are important to the client and should be reflected throughout each itinerary in activities, locations, and experiences.**` : ''}
- **CRITICAL: Each of the 3 options MUST be COMPLETELY DIFFERENT from each other:**
  * Different themes (e.g., "Cultural Heritage", "Wildlife Safari", "Beach & Wellness", "Adventure & Nature", "Luxury Relaxation")
  * Different location sequences and routes
  * Different types of experiences and activities
  * Different focus areas and highlights
  * Unique titles that clearly distinguish each option
- Each option MUST have EXACTLY ${actualDuration || 'the specified number of'} days - match the EXACT duration provided above (${actualDuration || requestData.duration || 'Not specified'} days)
- The itinerary must span from ${startDateFormatted} to ${endDateFormatted} - use these EXACT dates
- Use ALL the information provided: travel dates, duration, passenger info, and additional preferences
- Do NOT default to 6 days - use the ACTUAL duration from the client's request
- Plan activities and locations based on the actual number of days available
- **ROUTE PLANNING - CRITICAL RULES (APPLY TO EACH OF THE 3 OPTIONS):**

1. **NO BACKTRACKING.**
   - The travel route must flow geographically in one direction.
   - Do not move north → south → north again.
   - Each destination must follow a realistic driving path.
   - Once you leave a region, do not return to it later in the itinerary.
   - Each of the 3 options can have different routes, but each individual option must flow logically without backtracking.

2. **PROPER PACING.**
   - No rushing through destinations.
   - No more than 1 major location transfer per day.
   - Include rest time between activities and travel.
   - Avoid 1-night stays in far destinations unless it's an airport transit day.
   - Safari destinations should not exceed 1 night unless absolutely necessary for the itinerary.

3. **REALISTIC ROUTING EXAMPLE FLOWS:**
   - Colombo → Sigiriya → Kandy → Nuwara Eliya → Ella → Yala → Galle → Airport
   - OR South Coast first → Hill Country → Cultural Triangle → Airport
   - Plan routes that make the most geographic and logical sense for the duration available.
   - The 3 options can explore different regions or follow different paths, but each must be a logical, one-direction flow.

- Use ALL the information provided: travel dates, duration, passenger info, and additional preferences
- Plan locations naturally based on the route - use appropriate location names that fit the geographic flow
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
      "total_kilometers": <number>,
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
      ],
      "total_kilometers": <number>
    }
  ]
}

**IMPORTANT: Calculate "total_kilometers" for EACH option as follows:**
1. The journey starts in Colombo and ends in Colombo.
2. For transfer days (days with major location change/move to a different city):
   - Calculate realistic ROAD distance between cities (NOT straight-line distance).
   - Use actual driving distances (e.g., Colombo to Sigiriya ≈ 170km, Sigiriya to Kandy ≈ 100km, Kandy to Nuwara Eliya ≈ 80km, Nuwara Eliya to Ella ≈ 50km, Ella to Yala ≈ 120km, Yala to Galle ≈ 200km, Galle to Colombo ≈ 120km, etc.)
   - Sum all transfer distances throughout the itinerary.
3. For non-transfer days (same city, no major move):
   - Add only 90km per day (for local exploration within the city/area).
4. Add the return journey from the last location back to Colombo (realistic road distance).
5. Sum all values: (all transfer distances) + (90km × number of non-transfer days) + (return to Colombo distance) = total_kilometers
6. Return the total as a number (e.g., 1250, not "1250 km")

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

    // Generate options one at a time and save incrementally to handle timeout gracefully
    // This way if we timeout, at least some options are saved
    const itineraryOptions: any = { options: [] }
    const numOptions = 3
    
    // Helper function to generate a single option
    const generateSingleOption = async (optionNumber: number, existingOptions: any[]): Promise<any> => {
      // Create a prompt for a single option, mentioning existing ones to ensure uniqueness
      const existingTitles = existingOptions.map((opt: any) => opt.title).join(', ')
      const existingSummaries = existingOptions.map((opt: any) => opt.summary?.substring(0, 100)).filter(Boolean).join(' | ')
      
      const singleOptionPrompt = `${prompt}

IMPORTANT: Generate ONLY ONE itinerary option (option ${optionNumber} of 3). 
${existingOptions.length > 0 ? `**CRITICAL UNIQUENESS REQUIREMENT: The following options have already been generated:
- Titles: ${existingTitles}
${existingSummaries ? `- Themes: ${existingSummaries}` : ''}

You MUST create a COMPLETELY DIFFERENT itinerary that:
- Has a different theme and focus (e.g., if others are "Cultural Heritage" and "Wildlife Safari", create something like "Beach & Wellness" or "Adventure & Nature")
- Visits different locations or in a different order
- Offers different types of experiences and activities
- Has a unique title that clearly distinguishes it from the existing options
- Do NOT repeat similar activities, locations, or themes from the existing options**` : ''}
${requestData.additional_preferences && requestData.additional_preferences.trim() ? `**MANDATORY: You MUST incorporate the client's additional preferences: "${requestData.additional_preferences}" in this itinerary. These preferences should be reflected in activities, locations, and experiences.**` : ''}
Return JSON in this format: { "title": "...", "summary": "...", "total_kilometers": <number>, "days": [...] }

**IMPORTANT: Include "total_kilometers" field calculated as:**
1. The journey starts in Colombo and ends in Colombo.
2. For transfer days: Calculate realistic ROAD distance between cities (NOT straight-line). Use actual driving distances.
3. For non-transfer days: Add only 90km per day (local exploration).
4. Add return journey from last location to Colombo (realistic road distance).
5. Sum: (all transfer distances) + (90km × non-transfer days) + (return to Colombo) = total_kilometers
6. Return as a number (e.g., 1250)`

      let completion
      let generatedContent = ''
      const maxRetries = 2
      let currentMaxTokens = 6000
      
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
              {
                role: 'system',
                content:
                  'You are a luxury travel consultant specializing in bespoke Sri Lanka experiences. Create premium, curated itineraries with clear structure. Always generate FRESH, UNIQUE, and CREATIVE options. CRITICAL: Every single day MUST include an "image" field that showcases the day\'s highlight. Always respond with valid JSON only. Never use markdown. Never add explanations. Return only the JSON object.',
              },
              {
                role: 'user',
                content: singleOptionPrompt,
              },
            ],
            temperature: 0.9,
            max_tokens: currentMaxTokens,
            response_format: { type: 'json_object' },
          })

          generatedContent = completion.choices[0]?.message?.content?.trim() || ''
          
          const finishReason = completion.choices[0]?.finish_reason
          if (finishReason === 'length') {
            if (attempt < maxRetries) {
              currentMaxTokens = Math.min(Math.floor(currentMaxTokens * 1.5), 10000)
              await new Promise(resolve => setTimeout(resolve, 500 * attempt))
              continue
            }
          }
          
          if (generatedContent) break
        } catch (apiError) {
          console.error(`OpenAI API error on attempt ${attempt}:`, apiError)
          if (attempt === maxRetries) {
            throw new Error('Failed to generate option after multiple attempts')
          }
          await new Promise(resolve => setTimeout(resolve, 500 * attempt))
        }
      }

      if (!generatedContent) {
        throw new Error('Failed to generate option')
      }

      // Parse and validate the single option
      let cleanedContent = generatedContent.trim()
      cleanedContent = cleanedContent.replace(/^```(?:json|JSON)?\n?/gm, '').replace(/\n?```$/gm, '').trim()
      const jsonMatch = cleanedContent.match(/\{[\s\S]*\}/)
      if (jsonMatch) cleanedContent = jsonMatch[0]
      
      // Fix incomplete JSON
      const openBraces = (cleanedContent.match(/\{/g) || []).length
      const closeBraces = (cleanedContent.match(/\}/g) || []).length
      if (openBraces !== closeBraces) {
        cleanedContent += '\n' + '}'.repeat(openBraces - closeBraces)
      }
      
      const option = JSON.parse(cleanedContent)
      
      // Validate option structure
      if (!option.title || !option.summary || !Array.isArray(option.days)) {
        throw new Error('Invalid option format: missing required fields')
      }
      
      const expectedDays = actualDuration || requestData.duration
      if (expectedDays && option.days.length !== expectedDays) {
        throw new Error(`Invalid option format: expected ${expectedDays} days but got ${option.days.length} days`)
      }
      
      // Ensure every day has an image (using actual file names that exist)
      const locationImageMap: Record<string, string> = {
        "Colombo": "/images/arrivalincolombo.jpg",
        "Sigiriya": "/images/sigirya.jpg",
        "Ella": "/images/damrotea.jpg",
        "Yala": "/images/leopard.jpg",
        "Galle": "/images/galle.jpg",
        "Kandy": "/images/kandy.jpg",
        "Nuwara Eliya": "/images/damrotea.jpg"
      }
      
      for (const day of option.days) {
        if (!day.image || typeof day.image !== 'string') {
          day.image = locationImageMap[day.location] || "/images/placeholder.jpg"
        }
      }
      
      return option
    }

    // Generate and save options one at a time
    try {
      for (let i = 0; i < numOptions; i++) {
        console.log(`Generating option ${i + 1} of ${numOptions}...`)
        
        const option = await generateSingleOption(i + 1, itineraryOptions.options)
        itineraryOptions.options.push(option)
        
        // Save incrementally after each option is generated
        const partialOptionsString = JSON.stringify(itineraryOptions)
        const { error: partialUpdateError } = await supabase
          .from('requests')
          .update({ 
            itineraryoptions: partialOptionsString,
            updated_at: new Date().toISOString()
          })
          .eq('id', requestId)
        
        if (partialUpdateError) {
          console.error(`Error saving partial options (${i + 1}/${numOptions}):`, partialUpdateError)
        } else {
          console.log(`Successfully saved option ${i + 1} of ${numOptions}`)
        }
      }
      
      // Final validation
      if (itineraryOptions.options.length !== numOptions) {
        return NextResponse.json(
          { 
            success: false, 
            error: `Only generated ${itineraryOptions.options.length} of ${numOptions} options`,
            partial: true,
            optionsGenerated: itineraryOptions.options.length
          },
          { status: 500 }
        )
      }
      
      // Final save with selected_option cleared
      const itineraryOptionsString = JSON.stringify(itineraryOptions)
      const { error: finalUpdateError } = await supabase
        .from('requests')
        .update({ 
          itineraryoptions: itineraryOptionsString,
          selected_option: null, // Clear selection so user must select a new option
          updated_at: new Date().toISOString()
        })
        .eq('id', requestId)

      if (finalUpdateError) {
        console.error('Error in final update:', finalUpdateError)
        // Options are already saved incrementally, so this is not critical
      }

      // Return success response
      return NextResponse.json({ 
        success: true,
        optionsGenerated: itineraryOptions.options.length
      })
    } catch (generateError) {
      console.error('Error generating options:', generateError)
      
      // Check if we have any partial options saved
      const { data: currentData } = await supabase
        .from('requests')
        .select('itineraryoptions')
        .eq('id', requestId)
        .single()
      
      let partialOptionsCount = 0
      if (currentData?.itineraryoptions) {
        try {
          const parsed = typeof currentData.itineraryoptions === 'string' 
            ? JSON.parse(currentData.itineraryoptions) 
            : currentData.itineraryoptions
          if (parsed?.options && Array.isArray(parsed.options)) {
            partialOptionsCount = parsed.options.length
          }
        } catch {}
      }
      
      return NextResponse.json(
        { 
          success: false, 
          error: generateError instanceof Error ? generateError.message : 'Failed to generate itinerary',
          partial: partialOptionsCount > 0,
          optionsGenerated: partialOptionsCount
        },
        { status: 500 }
      )
    }
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
