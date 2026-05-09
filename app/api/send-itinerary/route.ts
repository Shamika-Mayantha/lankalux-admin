import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
const nodemailer = require('nodemailer')

function makeShareToken() {
  // URL-safe token
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 10)}`
}

export async function POST(request: Request) {
  try {
    // Parse request body
    const body = await request.json()
    const {
      id: requestId,
      send_options: sendOptionsBody,
      include_itinerary: incItinRaw,
      include_hotel: incHotelRaw,
      hotel: hotelRaw,
    } = body
    const include_itinerary = incItinRaw !== undefined ? !!incItinRaw : true
    const include_hotel = !!incHotelRaw
    const hotelFromBody = hotelRaw && typeof hotelRaw === 'object' ? hotelRaw : null
    const sendOptions = sendOptionsBody && typeof sendOptionsBody === 'object'
      ? {
          include_vehicle: !!sendOptionsBody.include_vehicle,
          include_price: !!sendOptionsBody.include_price,
          price: typeof sendOptionsBody.price === 'string' ? sendOptionsBody.price.trim() || null : null,
          vehicle_option: sendOptionsBody.vehicle_option && typeof sendOptionsBody.vehicle_option === 'object'
            ? {
                id: sendOptionsBody.vehicle_option.id,
                name: sendOptionsBody.vehicle_option.name,
                description: sendOptionsBody.vehicle_option.description,
                images: Array.isArray(sendOptionsBody.vehicle_option.images) ? sendOptionsBody.vehicle_option.images : [],
              }
            : null,
        }
      : { include_vehicle: false, include_price: false, price: null, vehicle_option: null }

    // Validate request ID
    if (!requestId || typeof requestId !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Request ID is required' },
        { status: 400 }
      )
    }

    // Validate environment variables
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('Missing SUPABASE_SERVICE_ROLE_KEY')
      return NextResponse.json(
        { success: false, error: 'Missing Supabase service key' },
        { status: 500 }
      )
    }

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      console.error('Missing NEXT_PUBLIC_SUPABASE_URL')
      return NextResponse.json(
        { success: false, error: 'Missing Supabase URL' },
        { status: 500 }
      )
    }

    // Email configuration
    console.log("=== ENV DEBUG START ===")
    console.log("Project name check: send-itinerary route running")
    console.log("SMTP_HOST:", process.env.SMTP_HOST)
    console.log("SMTP_PORT:", process.env.SMTP_PORT)
    console.log("SMTP_USER:", process.env.SMTP_USER)
    console.log("SMTP_PASS:", process.env.SMTP_PASS ? "***EXISTS***" : "MISSING")
    console.log("SMTP_PASSWORD:", process.env.SMTP_PASSWORD ? "***EXISTS***" : "MISSING")
    console.log("All ENV Keys:", Object.keys(process.env).filter(key => key.includes('SMTP')))
    console.log("=== ENV DEBUG END ===")
    
    const emailHost = process.env.SMTP_HOST
    const emailPort = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT) : 587
    const emailUser = process.env.SMTP_USER
    const emailPass = process.env.SMTP_PASS || process.env.SMTP_PASSWORD
    const emailFrom = process.env.SMTP_FROM || emailUser

    if (!emailHost || !emailUser || !emailPass) {
      console.error('Missing email configuration')
      console.error('SMTP_HOST missing:', !emailHost)
      console.error('SMTP_USER missing:', !emailUser)
      console.error('SMTP_PASS/SMTP_PASSWORD missing:', !emailPass)
      return NextResponse.json(
        { success: false, error: 'Email service not configured. Please check SMTP environment variables.' },
        { status: 500 }
      )
    }

    // Initialize server-side Supabase client
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    // Fetch request details from database
    const { data, error: fetchError } = await supabase
      .from('Client Requests')
      .select('*')
      .eq('id', requestId)
      .single()

    if (fetchError || !data) {
      console.error('Error fetching request:', fetchError)
      return NextResponse.json(
        { success: false, error: 'Failed to fetch request details' },
        { status: 404 }
      )
    }

    const requestData = data as any

    if (!include_itinerary && !include_hotel) {
      return NextResponse.json(
        { success: false, error: 'Choose at least one: Include itinerary or Include hotel' },
        { status: 400 }
      )
    }

    if (!requestData.email) {
      return NextResponse.json(
        { success: false, error: 'Client email not found' },
        { status: 400 }
      )
    }

    // Use the deployed app domain that serves the itinerary pages.
    // (The apex domain may be configured elsewhere; using the app domain avoids GitHub Pages 404s.)
    const baseUrl = 'https://admin.lankalux.com'
    let itineraryUrl = ''
    let selectedOption: any = null
    let shareToken: string | null = null
    let fallbackItineraryUrl: string | null = null

    if (include_itinerary) {
      if (requestData.selected_option === null || requestData.selected_option === undefined) {
        return NextResponse.json(
          { success: false, error: 'No itinerary option selected' },
          { status: 400 }
        )
      }
      if (!requestData.public_token) {
        return NextResponse.json(
          { success: false, error: 'Public token not found. Please select an option first.' },
          { status: 400 }
        )
      }
      let itineraryOptions: { options?: unknown[] }
      if (requestData.itineraryoptions && typeof requestData.itineraryoptions === 'string') {
        try {
          itineraryOptions = JSON.parse(requestData.itineraryoptions)
        } catch (parseError) {
          console.error('Error parsing itineraryoptions:', parseError)
          return NextResponse.json(
            { success: false, error: 'Failed to parse itinerary options' },
            { status: 500 }
          )
        }
      } else {
        return NextResponse.json(
          { success: false, error: 'Itinerary options not found' },
          { status: 400 }
        )
      }
      selectedOption = itineraryOptions.options?.[requestData.selected_option]
      if (!selectedOption) {
        return NextResponse.json(
          { success: false, error: 'Selected itinerary option not found' },
          { status: 400 }
        )
      }
      const optionIndex = Number(requestData.selected_option)
      if (!Number.isFinite(optionIndex) || optionIndex < 0) {
        return NextResponse.json(
          { success: false, error: 'Invalid itinerary option index' },
          { status: 400 }
        )
      }

      // IMPORTANT: create a stable share token per-send so links never change,
      // even if itineraries are regenerated later.
      shareToken = makeShareToken()
      itineraryUrl = `${baseUrl}/itinerary/share/${shareToken}`
      fallbackItineraryUrl = `${baseUrl}/itinerary/${requestData.public_token}/${optionIndex}`
      console.log('Itinerary URL:', { itineraryUrl, optionIndex, shareToken })
    }

    let hotelPayload: import('@/lib/email-itinerary-hotel').HotelEmailPayload | null = null
    if (include_hotel) {
      const h = hotelFromBody as Record<string, unknown> | null
      if (!h?.name || typeof h.name !== 'string' || !String(h.name).trim()) {
        return NextResponse.json(
          { success: false, error: 'Select a hotel to include in the email' },
          { status: 400 }
        )
      }
      hotelPayload = {
        name: String(h.name).trim(),
        location: typeof h.location === 'string' ? h.location : '',
        mapsUrl: typeof h.mapsUrl === 'string' ? h.mapsUrl : '',
        starRating: typeof h.starRating === 'string' ? h.starRating : '',
        roomType: typeof h.roomType === 'string' ? h.roomType : '',
        showPrice: !!h.showPrice,
        pricePerNight: typeof h.pricePerNight === 'string' ? h.pricePerNight : '',
        description: typeof h.description === 'string' ? h.description : '',
        images: Array.isArray(h.images)
          ? h.images
              .map((x: unknown) =>
                typeof x === 'string' ? x : x && typeof x === 'object' && 'src' in x ? String((x as { src: string }).src) : ''
              )
              .filter(Boolean)
          : [],
      }
    }

    // Create email transporter
    // For Zoho Mail, ensure you're using an App Password, not your regular account password
    const transporter = nodemailer.createTransport({
      host: emailHost,
      port: emailPort,
      secure: emailPort === 465, // true for 465, false for other ports
      auth: {
        user: emailUser,
        pass: emailPass,
      },
      tls: {
        // Do not fail on invalid certs
        rejectUnauthorized: false
      }
    })
    
    // Verify transporter configuration
    try {
      await transporter.verify()
      console.log('SMTP server is ready to send emails')
    } catch (verifyError) {
      console.error('SMTP verification failed:', verifyError)
      return NextResponse.json(
        { 
          success: false, 
          error: 'SMTP server verification failed. Please check your credentials.',
          details: verifyError instanceof Error ? verifyError.message : String(verifyError),
        },
        { status: 500 }
      )
    }

    const itinerarySnapshot =
      include_itinerary && selectedOption ? JSON.parse(JSON.stringify(selectedOption)) : null

    // Resolve the final URL BEFORE building/sending email content.
    // If share insert fails, we fallback now so the email button always points to a valid URL.
    if (include_itinerary && itinerarySnapshot && shareToken) {
      const { error: shareInsertError } = await supabase
        .from('itinerary_shares')
        .insert({
          share_token: shareToken,
          request_id: requestData.id,
          option_index: requestData.selected_option,
          itinerary_data: itinerarySnapshot,
          send_options: sendOptions,
        } as any)

      if (shareInsertError) {
        console.error('Error inserting itinerary_shares (falling back to per-option link):', shareInsertError)
        if (fallbackItineraryUrl) {
          itineraryUrl = fallbackItineraryUrl
          shareToken = null
        }
      }
    }

    // Format dates
    const startDateFormatted = requestData.start_date
      ? new Date(requestData.start_date).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })
      : 'Not specified'
    const endDateFormatted = requestData.end_date
      ? new Date(requestData.end_date).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })
      : 'Not specified'

    const journeyTitle = include_itinerary && selectedOption?.title ? String(selectedOption.title) : null
    const premiumSubjects = [
      'Your Sri Lanka Journey Is Ready',
      'A Journey Designed Just For You',
      'Your LankaLux Experience Awaits',
      'Discover Your Personalized Sri Lanka Escape',
      'Your Tailor-Made Sri Lanka Journey Is Ready',
    ]
    const subjectSeed = (requestData.id || requestId || '').split('').reduce((a: number, c: string) => a + c.charCodeAt(0), 0)
    const emailSubject = journeyTitle ? `LankaLux Journey - ${journeyTitle}` : premiumSubjects[subjectSeed % premiumSubjects.length]
    const preheader = 'Your personalized Sri Lanka journey is ready.'
    const logoUrl = `${baseUrl}/favicon.png`
    const ctaText = 'VIEW YOUR COMPLETE JOURNEY'
    const emailHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { font-family: Arial, Helvetica, sans-serif; color: #2c2c2c; background: #ffffff; margin: 0; padding: 0; }
            .wrap { width: 100%; background: #ffffff; padding: 0; }
            .card { max-width: 640px; margin: 0 auto; background: #ffffff; }
            .top { background: #1f1f1f; padding: 26px 18px 18px; text-align: center; }
            .logo { width: 54px; height: 54px; border-radius: 50%; object-fit: cover; display: inline-block; margin: 0 auto 10px; }
            .brand { margin: 0; font-family: Georgia, 'Times New Roman', serif; font-size: 30px; letter-spacing: 0.5px; color: #c9a14a; font-weight: 500; }
            .tag { margin-top: 6px; font-size: 11px; letter-spacing: 0.14em; color: #ffffff; opacity: 0.85; }
            .goldline { height: 2px; background: #c9a14a; }
            .content { padding: 24px 22px 26px; line-height: 1.7; }
            .dear { margin: 0 0 14px; font-size: 14px; color: #2c2c2c; }
            .p { margin: 0 0 14px; font-size: 13px; color: #4a4a4a; }
            .meta { background: #f6f6f6; border-left: 3px solid #c9a14a; padding: 14px 14px; margin: 14px 0 16px; }
            .meta-row { display: table; width: 100%; margin: 8px 0; }
            .meta-k { display: table-cell; width: 140px; font-size: 10px; letter-spacing: 0.06em; text-transform: uppercase; color: #6a6a6a; vertical-align: top; }
            .meta-v { display: table-cell; font-size: 12px; color: #2c2c2c; font-weight: 600; vertical-align: top; }
            .meta-v-gold { color: #c9a14a; font-weight: 700; }
            .cta { text-align: center; margin: 18px 0 10px; }
            .btn { display: inline-block; background: #c9a14a; color: #1b1b1b !important; text-decoration: none; padding: 12px 22px; border-radius: 6px; font-weight: 800; font-size: 12px; letter-spacing: 0.04em; }
            .small { margin: 0; font-size: 12px; color: #6a6a6a; line-height: 1.65; }
            .preheader { display:none!important; visibility:hidden; opacity:0; color:transparent; height:0; width:0; font-size:1px; line-height:1px; }
          </style>
        </head>
        <body>
          <div class="preheader">${preheader}</div>
          <div class="wrap">
            <div class="card">
              <div class="top">
                <img src="${logoUrl}" alt="LankaLux" class="logo" />
                <h1 class="brand">LankaLux</h1>
                <div class="tag">JOURNEY</div>
              </div>
              <div class="goldline"></div>
              <div class="content">
                <p class="dear">Dear ${requestData.client_name || 'Valued Client'},</p>
                <p class="p">We are absolutely delighted to share your personalized Sri Lanka journey with you. Every detail has been carefully crafted to ensure an unforgettable experience.</p>
                <div class="meta">
                  <div class="meta-row"><div class="meta-k">TRAVEL DATES</div><div class="meta-v">${startDateFormatted} - ${endDateFormatted}</div></div>
                  ${journeyTitle ? `<div class="meta-row"><div class="meta-k">SELECTED JOURNEY</div><div class="meta-v meta-v-gold">${journeyTitle}</div></div>` : ''}
                  ${requestData.duration ? `<div class="meta-row"><div class="meta-k">DURATION</div><div class="meta-v">${requestData.duration} Days</div></div>` : ''}
                </div>
                <div class="cta"><a class="btn" href="${itineraryUrl}">${ctaText}</a></div>
                <p class="small">This link provides access to your complete journey details. We’ve designed every moment to showcase the beauty, culture, and wonder of Sri Lanka. If you have any questions or would like to discuss any modifications, please don’t hesitate to reach out. We’re here to make your journey perfect.</p>
              </div>
            </div>
          </div>
        </body>
      </html>
    `

    const emailText = [
      `Dear ${requestData.client_name || 'Valued Client'},`,
      '',
      journeyTitle ? `Journey: ${journeyTitle}` : '',
      `Start: ${startDateFormatted}`,
      `End: ${endDateFormatted}`,
      requestData.duration ? `Duration: ${requestData.duration} Days` : '',
      '',
      'You can view your personalized itinerary here:',
      itineraryUrl,
      '',
      'Warm regards,',
      'The LankaLux Team',
    ].join('\n')

    // Send email
    try {
      console.log('Attempting to send email...')
      console.log('Email config:', {
        host: emailHost,
        port: emailPort,
        user: emailUser,
        from: emailFrom,
        to: requestData.email,
        secure: emailPort === 465,
      })
      
      const emailResult = await transporter.sendMail({
        from: `"LankaLux" <${process.env.SMTP_USER}>`,
        to: requestData.email,
        subject: emailSubject,
        text: emailText,
        html: emailHtml,
      })
      
      console.log('Email sent successfully:', {
        messageId: emailResult.messageId,
        response: emailResult.response,
      })
    } catch (emailError) {
      console.error('Error sending email:', emailError)
      console.error('Email error details:', {
        message: emailError instanceof Error ? emailError.message : String(emailError),
        code: (emailError as any)?.code,
        command: (emailError as any)?.command,
        response: (emailError as any)?.response,
        responseCode: (emailError as any)?.responseCode,
      })
      return NextResponse.json(
        { 
          success: false, 
          error: 'Failed to send email',
          details: emailError instanceof Error ? emailError.message : String(emailError),
        },
        { status: 500 }
      )
    }

    // Update database after successful email send
    const now = new Date().toISOString()
    const isFirstSend = !requestData.sent_at
    const currentEmailCount = requestData.email_sent_count || 0

    // Get existing sent_options array or initialize as empty array
    let sentOptions: any[] = []
    if (requestData.sent_options) {
      try {
        sentOptions = typeof requestData.sent_options === 'string' 
          ? JSON.parse(requestData.sent_options) 
          : requestData.sent_options
        if (!Array.isArray(sentOptions)) {
          sentOptions = []
        }
      } catch (e) {
        console.error('Error parsing sent_options:', e)
        sentOptions = []
      }
    }

    sentOptions.push({
      ...(include_itinerary
        ? {
            option_index: requestData.selected_option,
            option_title: selectedOption.title,
            itinerary_url: itineraryUrl,
            itinerary_data: itinerarySnapshot,
            share_token: shareToken,
          }
        : { option_index: null, option_title: null, itinerary_url: null }),
      sent_at: now,
      send_options: sendOptions,
      include_itinerary,
      include_hotel,
      ...(include_hotel && hotelPayload ? { hotel_snapshot: hotelPayload } : {}),
    })
    
    // Sort by sent_at (most recent first) and keep only the most recent 10 entries
    // This prevents the array from growing too large while keeping recent history.
    // Stable links are still preserved in `itinerary_shares` even if this list is trimmed.
    sentOptions.sort((a: any, b: any) => {
      const dateA = new Date(a.sent_at || 0).getTime()
      const dateB = new Date(b.sent_at || 0).getTime()
      return dateB - dateA // Most recent first
    })
    
    // Keep only the most recent 10 sent options
    if (sentOptions.length > 10) {
      sentOptions = sentOptions.slice(0, 10)
    }

    const updateData: any = {
      last_sent_at: now,
      last_sent_option: include_itinerary ? requestData.selected_option : requestData.last_sent_option,
      email_sent_count: currentEmailCount + 1,
      sent_options: sentOptions,
      status: 'follow_up',
      updated_at: now,
    }

    // Set sent_at only if this is the first time
    if (isFirstSend) {
      updateData.sent_at = now
    }

    const { error: updateError } = await supabase
      .from('Client Requests')
      .update(updateData)
      .eq('id', requestId)

    if (updateError) {
      console.error('Error updating request after email send:', updateError)
      // Email was sent but database update failed - still return success
      // but log the error for manual correction
      return NextResponse.json(
        {
          success: true,
          warning: 'Email sent but failed to update database. Please update manually.',
        },
        { status: 200 }
      )
    }

    // Return success response
    return NextResponse.json({
      success: true,
      message: 'Itinerary sent successfully',
    })
  } catch (error) {
    console.error('Unexpected error sending itinerary:', error)
    console.error('Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      name: error instanceof Error ? error.name : undefined,
    })
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'An unexpected error occurred',
        details: process.env.NODE_ENV === 'development' 
          ? (error instanceof Error ? error.stack : String(error))
          : undefined,
      },
      { status: 500 }
    )
  }
}
