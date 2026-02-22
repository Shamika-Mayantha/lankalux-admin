import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'

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

    if (!requestData || !requestData.itineraryoptions) {
      return NextResponse.json(
        { success: false, error: 'Request or itinerary options not found' },
        { status: 404 }
      )
    }

    // Parse existing options
    let existingOptions: any[] = []
    try {
      const parsed = typeof requestData.itineraryoptions === 'string' 
        ? JSON.parse(requestData.itineraryoptions) 
        : requestData.itineraryoptions
      if (parsed?.options && Array.isArray(parsed.options)) {
        existingOptions = parsed.options.filter((opt: any) => opt !== null && opt !== undefined)
      }
    } catch {
      return NextResponse.json(
        { success: false, error: 'Failed to parse itinerary options' },
        { status: 500 }
      )
    }

    // Get the option to generate images for
    const option = existingOptions[optionIndex]
    if (!option || !option.days || !Array.isArray(option.days)) {
      return NextResponse.json(
        { success: false, error: 'Option not found or invalid' },
        { status: 404 }
      )
    }

    // Generate AI images for each day based on descriptions
    const generateDayImage = async (day: any): Promise<string> => {
      try {
        // Create a descriptive prompt for image generation
        const imagePrompt = `A beautiful, professional travel photograph of ${day.location}, Sri Lanka. ${day.title}. ${day.what_to_expect || ''} ${day.activities?.slice(0, 2).join(', ') || ''}. Stunning landscape, high quality, travel photography style, vibrant colors, luxury travel aesthetic.`
        
        const imageResponse = await openai.images.generate({
          model: 'dall-e-3',
          prompt: imagePrompt,
          size: '1024x1024',
          quality: 'standard',
          n: 1,
        })
        
        if (imageResponse.data && imageResponse.data[0]?.url) {
          return imageResponse.data[0].url
        }
      } catch (imageError) {
        console.error('Error generating image for day:', day.title, imageError)
      }
      
      // Fallback: keep existing image if generation fails
      return day.image || "/images/placeholder.jpg"
    }
    
    // Generate images for all days (in parallel for speed)
    const imagePromises = option.days.map((day: any) => generateDayImage(day))
    const generatedImages = await Promise.all(imagePromises)
    
    // Update each day with the generated image
    option.days.forEach((day: any, index: number) => {
      day.image = generatedImages[index]
    })

    // Update the option in the array
    const updatedOptions = [...existingOptions]
    updatedOptions[optionIndex] = option

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
        updated_at: new Date().toISOString()
      })
      .eq('id', requestId)

    if (updateError) {
      console.error('Error updating itineraryoptions:', updateError)
      return NextResponse.json(
        { success: false, error: 'Failed to save generated images' },
        { status: 500 }
      )
    }

    return NextResponse.json({ 
      success: true,
      option: option,
      optionIndex: optionIndex
    })
  } catch (error) {
    console.error('Unexpected error generating images:', error)
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
