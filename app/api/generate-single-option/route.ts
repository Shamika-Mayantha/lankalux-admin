import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { join } from 'path'

export async function POST(request: Request) {
  try {
    // Parse request body
    const body = await request.json()
    const { id: requestId, optionIndex } = body

    // Validate request ID and option index
    if (!requestId || typeof requestId !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Request ID is required' },
        { status: 400 }
      )
    }

    if (optionIndex === undefined || optionIndex === null || (optionIndex !== 0 && optionIndex !== 1 && optionIndex !== 2)) {
      return NextResponse.json(
        { success: false, error: 'Option index must be 0, 1, or 2' },
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

    // Calculate actual duration from dates (always recalculate from dates for accuracy)
    let actualDuration = requestData.duration
    if (requestData.start_date && requestData.end_date) {
      const start = new Date(requestData.start_date)
      const end = new Date(requestData.end_date)
      // Set to start of day to avoid timezone issues
      start.setHours(0, 0, 0, 0)
      end.setHours(0, 0, 0, 0)
      const diffTime = Math.abs(end.getTime() - start.getTime())
      const daysDiff = Math.floor(diffTime / (1000 * 60 * 60 * 24))
      actualDuration = daysDiff + 1 // +1 to include both start and end days (inclusive)
    }

    // Get existing options to ensure uniqueness
    let existingOptions: any[] = []
    if (requestData.itineraryoptions) {
      try {
        const parsed = typeof requestData.itineraryoptions === 'string' 
          ? JSON.parse(requestData.itineraryoptions) 
          : requestData.itineraryoptions
        if (parsed?.options && Array.isArray(parsed.options)) {
          // Filter out null values to prevent errors when accessing properties
          existingOptions = parsed.options.filter((opt: any) => opt !== null && opt !== undefined)
        }
      } catch {}
    }

    // Read photo mapping file with full details for unique assignment
    let photoMappingInfo = ''
    try {
      const photoMappingPath = join(process.cwd(), 'public', 'images', 'photo-mapping.json')
      const photoMappingContent = readFileSync(photoMappingPath, 'utf-8')
      const photoMapping = JSON.parse(photoMappingContent)
      
      // Build comprehensive photo mapping info
      photoMappingInfo = `\n═══════════════════════════════════════════════════════════════\nPHOTO MAPPING - CRITICAL RULES:\n═══════════════════════════════════════════════════════════════\n\n**MANDATORY: Each day MUST have a UNIQUE photo - NO REPEATS within this itinerary!**\n\n**PHOTO SELECTION PROCESS FOR EACH DAY:**\n1. Identify the day's MAIN HIGHLIGHT (the primary experience/attraction from the day title)\n2. Match the highlight to the most appropriate photo:\n   - If highlight is location-based → Use location primary or alternative image\n   - If highlight is activity-based → Use activity-specific image\n   - If highlight matches keywords → Use matching photo\n3. Track which photos you've already used - NEVER use the same photo twice\n4. If primary image is already used, use alternative_images from that location/activity\n\n**AVAILABLE LOCATION PHOTOS:**\n`
      Object.entries(photoMapping.locations).forEach(([location, data]: [string, any]) => {
        photoMappingInfo += `${location}:\n  Primary: ${data.primary_image}\n`
        if (data.alternative_images && data.alternative_images.length > 0) {
          photoMappingInfo += `  Alternatives: ${data.alternative_images.join(', ')}\n`
        }
      })
      
      photoMappingInfo += `\n**AVAILABLE ACTIVITY PHOTOS:**\n`
      Object.entries(photoMapping.activities).forEach(([activity, data]: [string, any]) => {
        photoMappingInfo += `${activity}: ${data.images.join(', ')}\n`
      })
      
      photoMappingInfo += `\n**ALL AVAILABLE IMAGES (use different ones for each day):**\n${photoMapping.all_available_images?.join(', ') || 'See location and activity photos above'}\n\n**REMEMBER:**\n- Map photos to the day's HIGHLIGHT (main experience), not just location\n- Each day gets ONE unique photo - track your usage\n- Prefer activity-specific photos when the highlight is activity-based\n- Only use placeholder.jpg as absolute last resort\n\n═══════════════════════════════════════════════════════════════\n`
    } catch (error) {
      console.warn('Could not read photo mapping file:', error)
    }

    const existingTitles = existingOptions.filter((opt: any) => opt && opt.title).map((opt: any) => opt.title).join(', ')
    
    const prompt = `You are an experienced and passionate luxury travel consultant who creates personalized, memorable journeys through Sri Lanka. Generate ONE distinct, premium itinerary option for the following client:

CLIENT INFORMATION:
- Client Name: ${requestData.client_name || 'Not specified'}
- Origin Country: ${requestData.origin_country || 'Not specified'}
- Travel Start Date: ${startDateFormatted}
- Travel End Date: ${endDateFormatted}
${passengerInfo}
${requestData.additional_preferences && requestData.additional_preferences.trim() ? `- **ADDITIONAL PREFERENCES (MANDATORY TO INCORPORATE): ${requestData.additional_preferences}**` : '- Additional Preferences: None provided'}
${photoMappingInfo}

${existingTitles ? `**CRITICAL UNIQUENESS REQUIREMENT: The following options have already been generated: ${existingTitles}. 

You MUST create a COMPLETELY DIFFERENT itinerary that:
- Has a different theme and focus (e.g., if others are "Cultural Heritage" and "Wildlife Safari", create something like "Beach & Wellness" or "Adventure & Nature")
- Visits different locations or in a different order
- Offers different types of experiences and activities
- Has a unique title that clearly distinguishes it from: ${existingTitles}
- Do NOT repeat similar activities, locations, or themes from the existing options**` : ''}

CRITICAL REQUIREMENTS:
- Generate ONE premium, bespoke, professionally curated itinerary option
${requestData.additional_preferences && requestData.additional_preferences.trim() ? `- **MANDATORY: You MUST incorporate the client's additional preferences: "${requestData.additional_preferences}". These preferences are important to the client and should be reflected throughout the itinerary in activities, locations, and experiences.**` : ''}
- **CALCULATE THE DURATION: Count the number of days from ${startDateFormatted} (Day 1 - START) to ${endDateFormatted} (LAST DAY - END), inclusive. The journey starts on ${startDateFormatted} and ends on ${endDateFormatted}. Calculate how many days this spans (including both start and end dates).**
- **MANDATORY: The "days" array MUST contain exactly that many day objects - one day for each day from start date to end date, inclusive.**
- Day 1 must correspond to ${startDateFormatted}
- The last day must correspond to ${endDateFormatted}
- Use ALL the information provided: travel dates, passenger info, and additional preferences
- Use consistent location names: Colombo, Sigiriya, Ella, Yala, Galle, Kandy, Nuwara Eliya
- Activities must be an array of strings (include 4-6 main activities per day)
- CRITICAL: Each activity MUST include a timestamp in the format "HH:MM - Activity description"
- Each day MUST include:
  * "image": MANDATORY - Select the most appropriate UNIQUE image path based on the day's MAIN HIGHLIGHT (the primary experience/attraction). Each day must have a DIFFERENT photo - NO REPEATS. Match the photo to what makes this day special (the highlight from the day title), not just the location.
  * "what_to_expect": Write a warm, engaging paragraph (3-4 sentences)
  * "optional_activities": An array of 2-4 optional activities
- Keep tone warm, elegant, premium, and human
- Make activities detailed, specific, and realistic
${requestData.number_of_children && requestData.number_of_children > 0 ? `- IMPORTANT: Consider child-friendly activities for ${requestData.number_of_children} child${requestData.number_of_children > 1 ? 'ren' : ''}` : ''}

Return ONLY valid JSON in this format. Calculate the number of days from ${startDateFormatted} to ${endDateFormatted} (inclusive) and create that many day objects:
{
  "title": "Option title",
  "summary": "Short elegant overview paragraph (3-4 lines)",
  "days": [
    {
      "day": 1,
      "title": "Day title for ${startDateFormatted}",
      "location": "Location name",
      "image": "/images/location.jpg",
      "activities": ["09:00 - Activity with timestamp"],
      "what_to_expect": "Description paragraph",
      "optional_activities": ["Optional activity"]
    },
    {
      "day": 2,
      "title": "Day title",
      "location": "Location name",
      "image": "/images/location.jpg",
      "activities": ["09:00 - Activity with timestamp"],
      "what_to_expect": "Description paragraph",
      "optional_activities": ["Optional activity"]
    }
    ... continue creating day objects until you reach the day corresponding to ${endDateFormatted}
  ]
}

REMINDER: Count the days from ${startDateFormatted} to ${endDateFormatted} (inclusive). Create exactly that many day objects in the days array.`

    // Generate single option with retry logic for correct day count
    // Ensure we have the calculated duration (always use date-based calculation if dates exist)
    const expectedDaysNum = actualDuration || requestData.duration || 6
    let completion
    let generatedContent = ''
    const maxRetries = 3
    let attempt = 0
    
    while (attempt < maxRetries) {
      try {
        attempt++
        // Calculate max_tokens based on duration (roughly 800 tokens per day)
        const calculatedMaxTokens = Math.min(Math.max(expectedDaysNum * 800, 3000), 5000)
        
        // Make prompt even more explicit on retry
        let currentPrompt = prompt
        if (attempt > 1) {
          currentPrompt = `${prompt}

CRITICAL RETRY INSTRUCTION: You previously generated the wrong number of days. You MUST generate EXACTLY ${expectedDaysNum} days. Count each day object in the "days" array. The array must have ${expectedDaysNum} items, numbered from day 1 to day ${expectedDaysNum}. This is non-negotiable.`
        }
        
        completion = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: `You are a luxury travel consultant. Create premium Sri Lanka itineraries. CRITICAL RULES: 
1. Every day MUST include an "image" field.
2. Calculate the number of days from the start date to the end date (inclusive) - count each day including both start and end dates.
3. The "days" array MUST contain exactly that calculated number of day objects - one for each day from start to end date.
4. Always respond with valid JSON only. Never use markdown. Return only the JSON object.
5. Day 1 corresponds to the start date, and the last day corresponds to the end date.`,
            },
            {
              role: 'user',
              content: currentPrompt,
            },
          ],
          temperature: attempt === 1 ? 0.9 : 0.7, // Lower temperature on retry for more consistency
          max_tokens: calculatedMaxTokens,
          response_format: { type: 'json_object' },
        })

        generatedContent = completion.choices[0]?.message?.content?.trim() || ''
        
        // Parse and check day count immediately
        if (generatedContent) {
          try {
            let cleanedContent = generatedContent.trim()
            cleanedContent = cleanedContent.replace(/^```(?:json|JSON)?\n?/gm, '').replace(/\n?```$/gm, '').trim()
            const jsonMatch = cleanedContent.match(/\{[\s\S]*\}/)
            if (jsonMatch) cleanedContent = jsonMatch[0]
            
            const openBraces = (cleanedContent.match(/\{/g) || []).length
            const closeBraces = (cleanedContent.match(/\}/g) || []).length
            if (openBraces > closeBraces) {
              cleanedContent += '}'.repeat(openBraces - closeBraces)
            }
            
            const testOption = JSON.parse(cleanedContent)
            if (testOption.days && Array.isArray(testOption.days)) {
              const actualDaysCount = testOption.days.length
              if (actualDaysCount === expectedDaysNum) {
                // Correct number of days, break out of retry loop
                break
              } else {
                console.warn(`Attempt ${attempt}: Generated ${actualDaysCount} days, expected ${expectedDaysNum}. Retrying...`)
                if (attempt === maxRetries) {
                  // Last attempt failed, we'll validate again later but continue
                  break
                }
                // Continue to retry
                continue
              }
            }
          } catch (parseTestError) {
            // If we can't parse, continue to retry
            if (attempt < maxRetries) {
              continue
            }
          }
        }
        
        // If we get here and it's the first attempt, break (success or will validate later)
        if (attempt === 1) break
        
      } catch (apiError) {
        console.error(`OpenAI API error on attempt ${attempt}:`, apiError)
        if (attempt === maxRetries) {
          return NextResponse.json(
            { success: false, error: 'Failed to generate option after multiple attempts' },
            { status: 500 }
          )
        }
        // Continue to retry
      }
    }
    
    if (!generatedContent) {
      return NextResponse.json(
        { success: false, error: 'Failed to generate option' },
        { status: 500 }
      )
    }

    if (!generatedContent) {
      return NextResponse.json(
        { success: false, error: 'Failed to generate option' },
        { status: 500 }
      )
    }

    // Parse and validate the option (simplified for speed)
    let cleanedContent = generatedContent.trim()
    cleanedContent = cleanedContent.replace(/^```(?:json|JSON)?\n?/gm, '').replace(/\n?```$/gm, '').trim()
    const jsonMatch = cleanedContent.match(/\{[\s\S]*\}/)
    if (jsonMatch) cleanedContent = jsonMatch[0]
    
    // Quick fix for incomplete JSON (only if needed)
    const openBraces = (cleanedContent.match(/\{/g) || []).length
    const closeBraces = (cleanedContent.match(/\}/g) || []).length
    if (openBraces > closeBraces) {
      cleanedContent += '}'.repeat(openBraces - closeBraces)
    }
    
    let newOption
    try {
      newOption = JSON.parse(cleanedContent)
    } catch (parseError) {
      console.error('JSON parse error:', parseError)
      return NextResponse.json(
        { success: false, error: 'Failed to parse generated option' },
        { status: 500 }
      )
    }
    
    // Validate option structure
    if (!newOption.title || !newOption.summary || !Array.isArray(newOption.days)) {
      return NextResponse.json(
        { success: false, error: 'Invalid option format: missing required fields' },
        { status: 500 }
      )
    }
    
    // Validate day count - recalculate from dates to ensure accuracy
    let calculatedDuration = expectedDaysNum
    if (requestData.start_date && requestData.end_date) {
      const start = new Date(requestData.start_date)
      const end = new Date(requestData.end_date)
      // Set to start of day to avoid timezone issues
      start.setHours(0, 0, 0, 0)
      end.setHours(0, 0, 0, 0)
      const diffTime = Math.abs(end.getTime() - start.getTime())
      calculatedDuration = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1 // +1 to include both start and end days
    }
    
    const actualDaysNum = newOption.days.length
    
    // Allow small tolerance (±1 day) in case of calculation differences, but log a warning
    if (calculatedDuration !== null && Math.abs(actualDaysNum - calculatedDuration) > 1) {
      // If difference is more than 1 day, return error
      return NextResponse.json(
        { success: false, error: `Invalid option format: expected ${calculatedDuration} days (from ${startDateFormatted} to ${endDateFormatted}) but got ${actualDaysNum} days. Please try generating again.` },
        { status: 500 }
      )
    } else if (calculatedDuration !== null && actualDaysNum !== calculatedDuration) {
      // If difference is exactly 1 day, try to fix it automatically
      console.warn(`Day count mismatch: expected ${calculatedDuration}, got ${actualDaysNum}. Attempting to fix...`)
      
      if (actualDaysNum < calculatedDuration) {
        // Add missing days at the end
        const lastDay = newOption.days[newOption.days.length - 1]
        const missingDays = calculatedDuration - actualDaysNum
        for (let i = 1; i <= missingDays; i++) {
          newOption.days.push({
            ...lastDay,
            day: actualDaysNum + i,
            title: `Day ${actualDaysNum + i}`,
            activities: lastDay.activities || [],
            optional_activities: lastDay.optional_activities || []
          })
        }
        console.log(`Added ${missingDays} missing day(s)`)
      } else if (actualDaysNum > calculatedDuration) {
        // Remove extra days
        newOption.days = newOption.days.slice(0, calculatedDuration)
        console.log(`Removed ${actualDaysNum - calculatedDuration} extra day(s)`)
      }
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
    
    for (const day of newOption.days) {
      if (!day.image || typeof day.image !== 'string') {
        day.image = locationImageMap[day.location] || "/images/placeholder.jpg"
      }
    }
    
    // Update or add the option to the existing options array
    const updatedOptions = [...existingOptions]
    updatedOptions[optionIndex] = newOption
    
    // Ensure array has 3 slots
    while (updatedOptions.length < 3) {
      updatedOptions.push(null)
    }
    
    // Save to database
    const itineraryOptions = { options: updatedOptions }
    const itineraryOptionsString = JSON.stringify(itineraryOptions)
    
    const { error: updateError } = await supabase
      .from('requests')
      .update({ 
        itineraryoptions: itineraryOptionsString,
        selected_option: null, // Clear selection when regenerating
        updated_at: new Date().toISOString()
      })
      .eq('id', requestId)

    if (updateError) {
      console.error('Error updating itineraryoptions:', updateError)
      return NextResponse.json(
        { success: false, error: 'Failed to save option' },
        { status: 500 }
      )
    }

    return NextResponse.json({ 
      success: true,
      option: newOption,
      optionIndex: optionIndex
    })
  } catch (error) {
    console.error('Unexpected error generating option:', error)
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
