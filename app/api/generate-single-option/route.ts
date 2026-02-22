import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { join } from 'path'

// Vercel Hobby plan has 10 second timeout
export const maxDuration = 10

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

    // Calculate actual duration from dates if duration is not provided
    let actualDuration = requestData.duration
    if (!actualDuration && requestData.start_date && requestData.end_date) {
      const start = new Date(requestData.start_date)
      const end = new Date(requestData.end_date)
      const diffTime = Math.abs(end.getTime() - start.getTime())
      actualDuration = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1 // +1 to include both start and end days
    }

    // Get existing options to ensure uniqueness
    let existingOptions: any[] = []
    if (requestData.itineraryoptions) {
      try {
        const parsed = typeof requestData.itineraryoptions === 'string' 
          ? JSON.parse(requestData.itineraryoptions) 
          : requestData.itineraryoptions
        if (parsed?.options && Array.isArray(parsed.options)) {
          existingOptions = parsed.options
        }
      } catch {}
    }

    // Read photo mapping file
    let photoMappingInfo = ''
    try {
      const photoMappingPath = join(process.cwd(), 'public', 'images', 'photo-mapping.json')
      const photoMappingContent = readFileSync(photoMappingPath, 'utf-8')
      const photoMapping = JSON.parse(photoMappingContent)
      
      photoMappingInfo = `\n\nAVAILABLE PHOTOS:\n`
      Object.entries(photoMapping.locations).forEach(([location, data]: [string, any]) => {
        photoMappingInfo += `- ${location}: Primary: ${data.primary_image}, Alternatives: ${data.alternative_images.join(', ')}\n`
      })
      Object.entries(photoMapping.activities).forEach(([activity, data]: [string, any]) => {
        photoMappingInfo += `- ${activity}: ${data.images.join(', ')}\n`
      })
    } catch (error) {
      console.warn('Could not read photo mapping file:', error)
    }

    const existingTitles = existingOptions.map((opt: any) => opt.title).filter(Boolean).join(', ')
    
    const prompt = `You are an experienced and passionate luxury travel consultant who creates personalized, memorable journeys through Sri Lanka. Generate ONE distinct, premium itinerary option for the following client:

CLIENT INFORMATION:
- Client Name: ${requestData.client_name || 'Not specified'}
- Origin Country: ${requestData.origin_country || 'Not specified'}
- Travel Start Date: ${startDateFormatted}
- Travel End Date: ${endDateFormatted}
- Total Duration: ${actualDuration || 'Not specified'} days
${passengerInfo}
- Additional Preferences: ${requestData.additional_preferences || 'None provided'}
${photoMappingInfo}

${existingTitles ? `IMPORTANT: Already generated options: ${existingTitles}. Make this option COMPLETELY DIFFERENT in theme, focus, and experiences.` : ''}

CRITICAL REQUIREMENTS:
- Generate ONE premium, bespoke, professionally curated itinerary option
- The option MUST have EXACTLY ${actualDuration || 'the specified number of'} days
- The itinerary must span from ${startDateFormatted} to ${endDateFormatted}
- Use ALL the information provided: travel dates, duration, passenger info, and additional preferences
- Use consistent location names: Colombo, Sigiriya, Ella, Yala, Galle, Kandy, Nuwara Eliya
- Activities must be an array of strings (include 4-6 main activities per day)
- CRITICAL: Each activity MUST include a timestamp in the format "HH:MM - Activity description"
- Each day MUST include:
  * "image": MANDATORY - Select the most appropriate image path from available photos based on location and activities
  * "what_to_expect": Write a warm, engaging paragraph (3-4 sentences)
  * "optional_activities": An array of 2-4 optional activities
- Keep tone warm, elegant, premium, and human
- Make activities detailed, specific, and realistic
${requestData.number_of_children && requestData.number_of_children > 0 ? `- IMPORTANT: Consider child-friendly activities for ${requestData.number_of_children} child${requestData.number_of_children > 1 ? 'ren' : ''}` : ''}

Return ONLY valid JSON in this format:
{
  "title": "Option title",
  "summary": "Short elegant overview paragraph (3-4 lines)",
  "days": [
    {
      "day": 1,
      "title": "Day title",
      "location": "Location name",
      "image": "/images/location.jpg",
      "activities": ["09:00 - Activity with timestamp"],
      "what_to_expect": "Description paragraph",
      "optional_activities": ["Optional activity"]
    }
  ]
}`

    // Generate single option
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
              content: 'You are a luxury travel consultant specializing in bespoke Sri Lanka experiences. Create premium, curated itineraries. CRITICAL: Every day MUST include an "image" field. Always respond with valid JSON only. Never use markdown. Return only the JSON object.',
            },
            {
              role: 'user',
              content: prompt,
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
          return NextResponse.json(
            { success: false, error: 'Failed to generate option after multiple attempts' },
            { status: 500 }
          )
        }
        await new Promise(resolve => setTimeout(resolve, 500 * attempt))
      }
    }

    if (!generatedContent) {
      return NextResponse.json(
        { success: false, error: 'Failed to generate option' },
        { status: 500 }
      )
    }

    // Parse and validate the option
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
    
    const newOption = JSON.parse(cleanedContent)
    
    // Validate option structure
    if (!newOption.title || !newOption.summary || !Array.isArray(newOption.days)) {
      return NextResponse.json(
        { success: false, error: 'Invalid option format: missing required fields' },
        { status: 500 }
      )
    }
    
    const expectedDays = actualDuration || requestData.duration
    if (expectedDays && newOption.days.length !== expectedDays) {
      return NextResponse.json(
        { success: false, error: `Invalid option format: expected ${expectedDays} days but got ${newOption.days.length} days` },
        { status: 500 }
      )
    }
    
    // Ensure every day has an image
    const locationImageMap: Record<string, string> = {
      "Colombo": "/images/colombo.jpg",
      "Sigiriya": "/images/sigiriya.jpg",
      "Ella": "/images/ella.jpg",
      "Yala": "/images/yala.jpg",
      "Galle": "/images/galle.jpg",
      "Kandy": "/images/kandy.jpg",
      "Nuwara Eliya": "/images/nuwara-eliya.jpg"
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
