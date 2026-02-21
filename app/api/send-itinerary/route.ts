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
    console.log("SMTP_PASS:", process.env.SMTP_PASS)
    console.log("All ENV Keys:", Object.keys(process.env))
    console.log("=== ENV DEBUG END ===")
    
    const emailHost = process.env.SMTP_HOST
    const emailPort = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT) : 587
    const emailUser = process.env.SMTP_USER
    const emailPass = process.env.SMTP_PASSWORD
    const emailFrom = process.env.SMTP_FROM || emailUser

    if (!emailHost || !emailUser || !emailPass) {
      console.error('Missing email configuration')
      return NextResponse.json(
        { success: false, error: 'Email service not configured' },
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

    // Build itinerary URL
    let baseUrl = 'http://localhost:3000'
    if (process.env.NEXT_PUBLIC_BASE_URL) {
      baseUrl = process.env.NEXT_PUBLIC_BASE_URL
    } else if (process.env.VERCEL_URL) {
      baseUrl = `https://${process.env.VERCEL_URL}`
    }
    const itineraryUrl = `${baseUrl}/itinerary/${requestData.public_token}`

    // Create email transporter
    const transporter = nodemailer.createTransport({
      host: emailHost,
      port: emailPort,
      secure: emailPort === 465,
      auth: {
        user: emailUser,
        pass: emailPass,
      },
    })

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

    // Build email content
    const emailSubject = 'Your LankaLux Sri Lanka Itinerary'
    const emailHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body {
              font-family: Arial, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
            }
            .header {
              background-color: #000;
              color: #d4af37;
              padding: 20px;
              text-align: center;
            }
            .content {
              padding: 20px;
              background-color: #f9f9f9;
            }
            .itinerary-link {
              display: inline-block;
              background-color: #d4af37;
              color: #000;
              padding: 12px 24px;
              text-decoration: none;
              border-radius: 4px;
              font-weight: bold;
              margin: 20px 0;
            }
            .footer {
              padding: 20px;
              text-align: center;
              color: #666;
              font-size: 12px;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>LankaLux</h1>
          </div>
          <div class="content">
            <p>Dear ${requestData.client_name || 'Valued Client'},</p>
            <p>We are delighted to share your personalized Sri Lanka itinerary with you.</p>
            <p><strong>Travel Dates:</strong> ${startDateFormatted} - ${endDateFormatted}</p>
            <p><strong>Selected Itinerary:</strong> ${selectedOption.title}</p>
            <p style="margin-top: 30px;">
              <a href="${itineraryUrl}" class="itinerary-link">View Your Itinerary</a>
            </p>
            <p>This link provides access to your selected itinerary option. If you have any questions or would like to discuss modifications, please don't hesitate to reach out.</p>
            <p>We look forward to creating an unforgettable experience for you in Sri Lanka.</p>
            <p>Best regards,<br>LankaLux Team</p>
          </div>
          <div class="footer">
            <p>© ${new Date().getFullYear()} LankaLux. All rights reserved.</p>
          </div>
        </body>
      </html>
    `

    const emailText = `
Dear ${requestData.client_name || 'Valued Client'},

We are delighted to share your personalized Sri Lanka itinerary with you.

Travel Dates: ${startDateFormatted} - ${endDateFormatted}
Selected Itinerary: ${selectedOption.title}

View your itinerary here: ${itineraryUrl}

This link provides access to your selected itinerary option. If you have any questions or would like to discuss modifications, please don't hesitate to reach out.

We look forward to creating an unforgettable experience for you in Sri Lanka.

Best regards,
LankaLux Team
    `

    // Send email
    try {
      await transporter.sendMail({
        from: emailFrom,
        to: requestData.email,
        subject: emailSubject,
        text: emailText,
        html: emailHtml,
      })
    } catch (emailError) {
      console.error('Error sending email:', emailError)
      return NextResponse.json(
        { success: false, error: 'Failed to send email' },
        { status: 500 }
      )
    }

    // Update database after successful email send
    const now = new Date().toISOString()
    const isFirstSend = !requestData.sent_at
    const currentEmailCount = requestData.email_sent_count || 0

    const updateData: any = {
      last_sent_at: now,
      email_sent_count: currentEmailCount + 1,
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
