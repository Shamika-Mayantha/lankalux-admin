import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
const nodemailer = require('nodemailer')

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

      // IMPORTANT: always include option index in the public link.
      // If we send only /itinerary/[token], the page redirects to the *current* selected_option
      // which causes older emails to "overlap" and always show the latest selected option.
      itineraryUrl = `${baseUrl}/itinerary/${requestData.public_token}/${optionIndex}`
      console.log('Itinerary URL:', { itineraryUrl, optionIndex })
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
    const emailSubject = premiumSubjects[subjectSeed % premiumSubjects.length]
    const preheader = 'Your personalized journey through Sri Lanka is ready.'
    const logoUrl = `${baseUrl}/favicon.png`
    const emailHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { font-family: 'Inter', Arial, Helvetica, sans-serif; color: #2c2c2c; background: #f6f5f3; margin: 0; padding: 28px 18px; }
            .card { max-width: 660px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 8px 24px rgba(0,0,0,0.07); }
            .header { background: linear-gradient(180deg, #1a1a1a 0%, #2a2a2a 100%); padding: 24px 24px 20px; text-align: center; }
            .logo { width: 54px; height: 54px; border-radius: 50%; object-fit: cover; margin-bottom: 8px; }
            .brand { color: #c9a14a; font-size: 30px; font-family: Georgia, 'Times New Roman', serif; letter-spacing: 0.5px; margin: 0; font-weight: 500; }
            .subtitle { color: #ffffff; opacity: 0.78; font-size: 11px; letter-spacing: 0.1em; margin-top: 3px; }
            .divider { height: 1px; background: #c9a14a; opacity: 0.8; }
            .content { padding: 36px 36px 30px; line-height: 1.72; }
            .lead { margin: 0 0 8px; font-size: 17px; color: #2f2f2f; }
            .warm { margin: 0 0 22px; font-size: 15px; color: #5b5b5b; }
            .meta { display: grid; grid-template-columns: 110px 1fr; row-gap: 10px; column-gap: 14px; margin: 8px 0 26px; }
            .meta-label { color: #8d8d8d; font-size: 12px; letter-spacing: 0.04em; text-transform: uppercase; }
            .meta-value { color: #2f2f2f; font-size: 15px; font-weight: 600; }
            .cta-wrap { text-align: center; margin: 8px 0 10px; }
            .btn { display: inline-block; background: #c9a14a; color: #fff !important; text-decoration: none; padding: 14px 26px; border-radius: 12px; font-weight: 700; font-size: 15px; letter-spacing: 0.01em; }
            .btn:hover { background: #b6903f; }
            .link { text-align: center; word-break: break-all; color: #9b8a66; font-size: 12px; margin-top: 10px; }
            .footer { padding: 0 36px 34px; font-size: 13px; color: #666; }
            .contact { margin-top: 10px; font-size: 12px; color: #8a8a8a; }
            .preheader { display:none!important; visibility:hidden; opacity:0; color:transparent; height:0; width:0; font-size:1px; line-height:1px; }
          </style>
        </head>
        <body>
          <div class="preheader">${preheader}</div>
          <div class="card">
            <div class="header">
              <img src="${logoUrl}" alt="LankaLux" class="logo" />
              <h1 class="brand">LankaLux</h1>
              <div class="subtitle">Your Journey</div>
            </div>
            <div class="divider"></div>
            <div class="content">
              <p class="lead">Dear ${requestData.client_name || 'Valued Client'},</p>
              <p class="warm">Your personalized journey through Sri Lanka is ready.<br/>We’ve carefully designed this experience based on your preferences.</p>
              <div class="meta">
                ${journeyTitle ? `<div class="meta-label">Journey</div><div class="meta-value">${journeyTitle}</div>` : ''}
                <div class="meta-label">Start</div><div class="meta-value">${startDateFormatted}</div>
                <div class="meta-label">End</div><div class="meta-value">${endDateFormatted}</div>
                ${requestData.duration ? `<div class="meta-label">Duration</div><div class="meta-value">${requestData.duration} Days</div>` : ''}
              </div>
              <div class="cta-wrap"><a class="btn" href="${itineraryUrl}">View Your Journey</a></div>
              <p class="link">${itineraryUrl}</p>
            </div>
            <div class="footer">
              Warm regards,<br/>LankaLux Team
              <div class="contact">Questions? Reply to this email.</div>
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

    const itinerarySnapshot =
      include_itinerary && selectedOption ? JSON.parse(JSON.stringify(selectedOption)) : null

    sentOptions.push({
      ...(include_itinerary
        ? {
            option_index: requestData.selected_option,
            option_title: selectedOption.title,
            itinerary_url: itineraryUrl,
            itinerary_data: itinerarySnapshot,
          }
        : { option_index: null, option_title: null, itinerary_url: null }),
      sent_at: now,
      send_options: sendOptions,
      include_itinerary,
      include_hotel,
      ...(include_hotel && hotelPayload ? { hotel_snapshot: hotelPayload } : {}),
    })
    
    // Sort by sent_at (most recent first) and keep only the most recent 10 entries
    // This prevents the array from growing too large while keeping recent history
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
