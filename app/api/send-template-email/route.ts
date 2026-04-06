import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
const nodemailer = require('nodemailer')
import { getTemplate, bodyTextToHtml, buildHtmlFromBody, type TemplateId } from '@/lib/email-templates'

const BASE_URL = 'https://lankalux.com'

function normalizeEditableBody(input: string): string {
  const raw = input.replace(/\r\n/g, '\n').trim()
  if (!raw) return ''

  let lines = raw.split('\n')

  // Remove leading "Dear <name>," line because HTML shell already renders greeting.
  if (lines.length > 0 && /^dear\s+.+,\s*$/i.test(lines[0].trim())) {
    lines = lines.slice(1)
    while (lines.length > 0 && lines[0].trim() === '') lines = lines.slice(1)
  }

  // Remove trailing signature if user pasted template text.
  const lower = lines.map((l) => l.trim().toLowerCase())
  const warmIdx = lower.findIndex((l) => l === 'warm regards,' || l === 'warm regards')
  if (warmIdx >= 0) {
    lines = lines.slice(0, warmIdx)
  }

  const cleaned = lines.join('\n').trim()
  return cleaned
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { requestId, templateId, subject: customSubject, body: customBody } = body as {
      requestId?: string
      templateId?: TemplateId
      subject?: string
      body?: string
    }

    if (!requestId || !templateId) {
      return NextResponse.json(
        { success: false, error: 'Request ID and template ID are required' },
        { status: 400 }
      )
    }

    const template = getTemplate(templateId)
    if (!template) {
      return NextResponse.json(
        { success: false, error: 'Invalid template ID' },
        { status: 400 }
      )
    }

    if (templateId === 'custom_email') {
      const sub = typeof customSubject === 'string' ? customSubject.trim() : ''
      const bod = customBody != null ? String(customBody).trim() : ''
      if (!sub || !bod) {
        return NextResponse.json(
          { success: false, error: 'Custom email requires both a subject and a message.' },
          { status: 400 }
        )
      }
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
      return NextResponse.json(
        { success: false, error: 'Server configuration error' },
        { status: 500 }
      )
    }

    const emailHost = process.env.SMTP_HOST
    const emailPort = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT) : 587
    const emailUser = process.env.SMTP_USER
    const emailPass = process.env.SMTP_PASS || process.env.SMTP_PASSWORD
    const emailFrom = process.env.SMTP_FROM || emailUser

    if (!emailHost || !emailUser || !emailPass) {
      return NextResponse.json(
        { success: false, error: 'Email service not configured. Please check SMTP environment variables.' },
        { status: 500 }
      )
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    const { data, error: fetchError } = await supabase
      .from('Client Requests')
      .select('id, email, client_name, public_token, selected_option, follow_up_emails_sent')
      .eq('id', requestId)
      .single()

    if (fetchError || !data) {
      return NextResponse.json(
        { success: false, error: 'Request not found' },
        { status: 404 }
      )
    }

    const requestData = data as {
      email: string | null
      client_name: string | null
      public_token: string | null
      selected_option: number | null
      follow_up_emails_sent?: string | null
    }

    if (!requestData.email) {
      return NextResponse.json(
        { success: false, error: 'Client email not found' },
        { status: 400 }
      )
    }

    const clientName = requestData.client_name || 'Valued Client'
    // Follow-up emails should never include an itinerary link/button.
    const itineraryUrl: string | null = null

    const subject = (customSubject && customSubject.trim()) ? customSubject.trim() : template.subject
    let emailHtml: string
    let emailText: string
    if (customBody != null && String(customBody).trim() !== '') {
      const normalizedBody = normalizeEditableBody(String(customBody))
      const bodyHtml = bodyTextToHtml(normalizedBody)
      emailHtml = buildHtmlFromBody({ clientName, bodyHtml, itineraryUrl })
      emailText = normalizedBody + '\n\nWarm regards,\nThe LankaLux Team'
    } else {
      emailHtml = template.getHtml({ clientName, itineraryUrl })
      const bodyOnly = normalizeEditableBody(template.getText({ clientName, itineraryUrl }))
      emailText = bodyOnly + '\n\nWarm regards,\nThe LankaLux Team'
    }

    const transporter = nodemailer.createTransport({
      host: emailHost,
      port: emailPort,
      secure: emailPort === 465,
      auth: { user: emailUser, pass: emailPass },
      tls: { rejectUnauthorized: false },
    })

    try {
      await transporter.verify()
    } catch (verifyError) {
      return NextResponse.json(
        {
          success: false,
          error: 'SMTP verification failed. Please check your credentials.',
          details: verifyError instanceof Error ? verifyError.message : String(verifyError),
        },
        { status: 500 }
      )
    }

    await transporter.sendMail({
      from: `"LankaLux" <${emailUser}>`,
      to: requestData.email,
      subject,
      text: emailText,
      html: emailHtml,
    })

    const now = new Date().toISOString()
    let followUpLog: { sent_at: string; template_id: string; template_name: string; subject: string }[] = []
    if (requestData.follow_up_emails_sent) {
      try {
        const parsed = JSON.parse(requestData.follow_up_emails_sent)
        followUpLog = Array.isArray(parsed) ? parsed : []
      } catch {
        followUpLog = []
      }
    }
    followUpLog.push({
      sent_at: now,
      template_id: templateId,
      template_name: template.name,
      subject,
    })
    if (followUpLog.length > 50) followUpLog = followUpLog.slice(-50)

    await supabase
      .from('Client Requests')
      .update({
        follow_up_emails_sent: JSON.stringify(followUpLog),
        updated_at: now,
      })
      .eq('id', requestId)

    return NextResponse.json({
      success: true,
      message: 'Follow-up email sent successfully',
    })
  } catch (error) {
    console.error('Error sending template email:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to send email',
      },
      { status: 500 }
    )
  }
}
