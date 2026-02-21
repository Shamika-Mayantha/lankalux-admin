import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
const nodemailer = require('nodemailer')

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
      .from('requests')
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

    // Validate that an option is selected
    if (requestData.selected_option === null || requestData.selected_option === undefined) {
      return NextResponse.json(
        { success: false, error: 'No itinerary option selected' },
        { status: 400 }
      )
    }

    // Validate that public_token exists
    if (!requestData.public_token) {
      return NextResponse.json(
        { success: false, error: 'Public token not found. Please select an option first.' },
        { status: 400 }
      )
    }

    // Validate email exists
    if (!requestData.email) {
      return NextResponse.json(
        { success: false, error: 'Client email not found' },
        { status: 400 }
      )
    }

    // Parse itinerary options
    let itineraryOptions
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

    // Get selected option
    const selectedOption = itineraryOptions.options?.[requestData.selected_option]
    if (!selectedOption) {
      return NextResponse.json(
        { success: false, error: 'Selected itinerary option not found' },
        { status: 400 }
      )
    }

    // Build itinerary URL with option index for unique links per option
    // Use admin.lankalux.com for all public itinerary links
    const baseUrl = "https://admin.lankalux.com"
    // Include option index in URL so each option has a unique link
    const itineraryUrl = `${baseUrl}/itinerary/${requestData.public_token}/${requestData.selected_option}`
    
    console.log('Itinerary URL generated:', {
      baseUrl,
      itineraryUrl,
      publicToken: requestData.public_token,
      optionIndex: requestData.selected_option,
      envVars: {
        NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
        VERCEL_URL: process.env.VERCEL_URL
      }
    })

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

    // Build email content with option-specific subject
    const emailSubject = `Your LankaLux Sri Lanka Journey - ${selectedOption.title}`
    const logoUrl = `${baseUrl}/favicon.png`
    const emailHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }
            body {
              font-family: 'Georgia', 'Times New Roman', serif;
              line-height: 1.8;
              color: #2c2c2c;
              background-color: #f5f5f5;
              padding: 0;
              margin: 0;
            }
            .email-container {
              max-width: 600px;
              margin: 0 auto;
              background-color: #ffffff;
              box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            }
            .header {
              background: linear-gradient(135deg, #1a1a1a 0%, #2c2c2c 100%);
              padding: 40px 20px;
              text-align: center;
              border-bottom: 4px solid #c8a45d;
            }
            .logo {
              width: 80px;
              height: 80px;
              margin: 0 auto 20px;
              display: block;
              border-radius: 50%;
              object-fit: cover;
            }
            .header h1 {
              color: #c8a45d;
              font-size: 32px;
              font-weight: 300;
              letter-spacing: 2px;
              margin: 0;
              font-family: 'Georgia', serif;
            }
            .header .subtitle {
              color: #ffffff;
              font-size: 14px;
              margin-top: 8px;
              letter-spacing: 1px;
              text-transform: uppercase;
            }
            .content {
              padding: 40px 30px;
              background-color: #ffffff;
            }
            .greeting {
              font-size: 18px;
              color: #2c2c2c;
              margin-bottom: 20px;
              font-weight: 400;
            }
            .intro-text {
              font-size: 16px;
              color: #555;
              margin-bottom: 30px;
              line-height: 1.8;
            }
            .info-box {
              background-color: #fafafa;
              border-left: 4px solid #c8a45d;
              padding: 20px;
              margin: 25px 0;
              border-radius: 4px;
            }
            .info-row {
              margin-bottom: 12px;
              font-size: 15px;
            }
            .info-row:last-child {
              margin-bottom: 0;
            }
            .info-label {
              color: #666;
              font-weight: 600;
              display: inline-block;
              min-width: 140px;
              text-transform: uppercase;
              font-size: 12px;
              letter-spacing: 0.5px;
            }
            .info-value {
              color: #2c2c2c;
              font-weight: 400;
            }
            .journey-title {
              color: #c8a45d;
              font-size: 20px;
              font-weight: 600;
              margin-top: 8px;
            }
            .journey-overview {
              background-color: #fafafa;
              border: 1px solid #e0e0e0;
              border-radius: 8px;
              padding: 25px;
              margin: 30px 0;
            }
            .journey-overview h3 {
              color: #c8a45d;
              font-size: 18px;
              font-weight: 600;
              margin-bottom: 15px;
              text-transform: uppercase;
              letter-spacing: 1px;
              border-bottom: 2px solid #c8a45d;
              padding-bottom: 10px;
            }
            .day-section {
              margin-bottom: 20px;
              padding-bottom: 20px;
              border-bottom: 1px solid #e0e0e0;
            }
            .day-section:last-child {
              border-bottom: none;
              margin-bottom: 0;
              padding-bottom: 0;
            }
            .day-header {
              display: flex;
              align-items: center;
              margin-bottom: 12px;
            }
            .day-number {
              background-color: #c8a45d;
              color: #ffffff;
              width: 35px;
              height: 35px;
              border-radius: 50%;
              display: flex;
              align-items: center;
              justify-content: center;
              font-weight: 600;
              font-size: 16px;
              margin-right: 12px;
            }
            .day-title {
              font-size: 16px;
              font-weight: 600;
              color: #2c2c2c;
            }
            .day-location {
              font-size: 14px;
              color: #666;
              margin-left: 47px;
              margin-top: -5px;
              margin-bottom: 10px;
            }
            .activities-list {
              margin-left: 47px;
              margin-top: 10px;
            }
            .activity-item {
              font-size: 14px;
              color: #555;
              margin-bottom: 8px;
              padding-left: 20px;
              position: relative;
            }
            .activity-item:before {
              content: "•";
              color: #c8a45d;
              font-weight: bold;
              position: absolute;
              left: 0;
            }
            .what-to-expect {
              background: linear-gradient(135deg, #fafafa 0%, #f5f5f5 100%);
              border-left: 4px solid #c8a45d;
              padding: 20px;
              margin: 30px 0;
              border-radius: 4px;
            }
            .what-to-expect h3 {
              color: #c8a45d;
              font-size: 16px;
              font-weight: 600;
              margin-bottom: 12px;
              text-transform: uppercase;
              letter-spacing: 0.5px;
            }
            .expect-item {
              font-size: 14px;
              color: #555;
              margin-bottom: 8px;
              padding-left: 20px;
              position: relative;
            }
            .expect-item:before {
              content: "✓";
              color: #c8a45d;
              font-weight: bold;
              position: absolute;
              left: 0;
            }
            .cta-section {
              text-align: center;
              margin: 40px 0;
              padding: 30px 0;
              border-top: 1px solid #e0e0e0;
              border-bottom: 1px solid #e0e0e0;
            }
            .journey-link {
              display: inline-block;
              background: linear-gradient(135deg, #c8a45d 0%, #b8944d 100%);
              color: #ffffff;
              padding: 16px 40px;
              text-decoration: none;
              border-radius: 6px;
              font-weight: 600;
              font-size: 16px;
              letter-spacing: 0.5px;
              box-shadow: 0 4px 12px rgba(200, 164, 93, 0.3);
              transition: all 0.3s ease;
              text-transform: uppercase;
            }
            .journey-link:hover {
              background: linear-gradient(135deg, #b8944d 0%, #a8843d 100%);
              box-shadow: 0 6px 16px rgba(200, 164, 93, 0.4);
              transform: translateY(-2px);
            }
            .closing-text {
              font-size: 15px;
              color: #555;
              margin: 30px 0 20px;
              line-height: 1.8;
            }
            .signature {
              margin-top: 30px;
              font-size: 15px;
              color: #2c2c2c;
            }
            .signature-name {
              font-weight: 600;
              color: #c8a45d;
              margin-top: 5px;
            }
            .footer {
              background-color: #1a1a1a;
              padding: 25px 20px;
              text-align: center;
              color: #999;
              font-size: 12px;
            }
            .footer p {
              margin: 5px 0;
            }
            .footer a {
              color: #c8a45d;
              text-decoration: none;
            }
            @media only screen and (max-width: 600px) {
              .content {
                padding: 30px 20px;
              }
              .header {
                padding: 30px 15px;
              }
              .info-label {
                display: block;
                margin-bottom: 5px;
              }
            }
          </style>
        </head>
        <body>
          <div class="email-container">
            <div class="header">
              <img src="${logoUrl}" alt="LankaLux Logo" class="logo" />
              <h1>LankaLux</h1>
              <div class="subtitle">Journey</div>
            </div>
            <div class="content">
              <div class="greeting">Dear ${requestData.client_name || 'Valued Client'},</div>
              
              <p class="intro-text">
                We are absolutely delighted to share your personalized Sri Lanka journey with you. Every detail has been carefully crafted to ensure an unforgettable experience.
              </p>
              
              <div class="info-box">
                <div class="info-row">
                  <span class="info-label">Travel Dates</span>
                  <span class="info-value">${startDateFormatted} - ${endDateFormatted}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Selected Journey</span>
                  <div class="journey-title">${selectedOption.title}</div>
                </div>
                ${requestData.duration ? `<div class="info-row">
                  <span class="info-label">Duration</span>
                  <span class="info-value">${requestData.duration} Days</span>
                </div>` : ''}
              </div>
              
              <div class="cta-section">
                <a href="${itineraryUrl}" class="journey-link">View Your Complete Journey</a>
              </div>
              
              <p class="closing-text">
                This link provides access to your complete journey details. We've designed every moment to showcase the beauty, culture, and wonder of Sri Lanka. If you have any questions or would like to discuss any modifications, please don't hesitate to reach out—we're here to make your journey perfect.
              </p>
              
              <p class="closing-text">
                We look forward to creating an extraordinary and unforgettable experience for you in the Pearl of the Indian Ocean.
              </p>
              
              <div class="signature">
                <p>Warm regards,</p>
                <p class="signature-name">The LankaLux Team</p>
              </div>
            </div>
            <div class="footer">
              <p>© ${new Date().getFullYear()} LankaLux. All rights reserved.</p>
              <p>Your journey to Sri Lanka begins here.</p>
            </div>
          </div>
        </body>
      </html>
    `

    const emailText = `
Dear ${requestData.client_name || 'Valued Client'},

We are absolutely delighted to share your personalized Sri Lanka journey with you. Every detail has been carefully crafted to ensure an unforgettable experience.

TRAVEL DETAILS:
Travel Dates: ${startDateFormatted} - ${endDateFormatted}
Selected Journey: ${selectedOption.title}
${requestData.duration ? `Duration: ${requestData.duration} Days` : ''}

View your complete journey here: ${itineraryUrl}

This link provides access to your complete journey details. We've designed every moment to showcase the beauty, culture, and wonder of Sri Lanka. If you have any questions or would like to discuss any modifications, please don't hesitate to reach out—we're here to make your journey perfect.

We look forward to creating an extraordinary and unforgettable experience for you in the Pearl of the Indian Ocean.

Warm regards,
The LankaLux Team

© ${new Date().getFullYear()} LankaLux. All rights reserved.
Your journey to Sri Lanka begins here.
    `

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

    // Check if this option was already sent (to avoid duplicates)
    const optionAlreadySent = sentOptions.some(
      (item: any) => item.option_index === requestData.selected_option
    )

    // Add this sent option to the array if not already present
    if (!optionAlreadySent) {
      sentOptions.push({
        option_index: requestData.selected_option,
        sent_at: now,
        option_title: selectedOption.title,
        itinerary_url: itineraryUrl, // Store the unique URL for this option
      })
    } else {
      // Update the sent_at timestamp and URL if option was already sent
      const existingIndex = sentOptions.findIndex(
        (item: any) => item.option_index === requestData.selected_option
      )
      if (existingIndex !== -1) {
        sentOptions[existingIndex].sent_at = now
        sentOptions[existingIndex].itinerary_url = itineraryUrl // Update URL in case it changed
      }
    }

    const updateData: any = {
      last_sent_at: now,
      last_sent_option: requestData.selected_option, // Save which option was sent
      email_sent_count: currentEmailCount + 1,
      sent_options: sentOptions, // Store all sent options
      status: 'follow_up',
      updated_at: now,
    }

    // Set sent_at only if this is the first time
    if (isFirstSend) {
      updateData.sent_at = now
    }

    const { error: updateError } = await supabase
      .from('requests')
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
