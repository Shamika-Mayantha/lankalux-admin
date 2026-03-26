import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

function safeText(x: unknown) {
  return typeof x === 'string' ? x.trim() : ''
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as any
    const sessionId = safeText(body?.sessionId)
    if (!sessionId) {
      const res = NextResponse.json({ success: false, error: 'sessionId is required' }, { status: 400 })
      Object.entries(corsHeaders).forEach(([k, v]) => res.headers.set(k, v))
      return res
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !supabaseServiceKey) {
      const res = NextResponse.json({ success: false, error: 'Server configuration error' }, { status: 500 })
      Object.entries(corsHeaders).forEach(([k, v]) => res.headers.set(k, v))
      return res
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const draft = body?.draft && typeof body.draft === 'object' ? body.draft : {}
    const messagesRaw = Array.isArray(body?.messages) ? body.messages : []
    const messages = messagesRaw
      .map((m: any) => ({
        role: m?.role === 'assistant' ? 'assistant' : 'user',
        content: safeText(m?.content),
        kind: safeText(m?.kind) || 'text',
      }))
      .filter((m: { content: string }) => m.content.length > 0)
      .slice(-80)

    const reversed = [...messages].reverse()
    const lastUserMessage = reversed.find((m) => m.role === 'user')?.content || null
    const lastAssistantMessage = reversed.find((m) => m.role === 'assistant')?.content || null

    const row = {
      session_id: sessionId,
      client_name: safeText(draft?.name) || null,
      email: safeText(draft?.email) || null,
      whatsapp: safeText(draft?.whatsapp) || null,
      request_id: safeText(body?.requestId) || null,
      selected_vehicle: safeText(body?.selectedVehicle) || null,
      last_user_message: lastUserMessage,
      last_assistant_message: lastAssistantMessage,
      message_count: messages.length,
      messages_json: messages,
      draft_json: draft,
      last_event: safeText(body?.eventType) || 'message',
      handoff_requested: !!body?.handoffRequested,
      page_url: safeText(body?.pageUrl) || null,
      user_agent: safeText(body?.userAgent) || null,
      updated_at: new Date().toISOString(),
    }

    const { error } = await supabase
      .from('website_chat_sessions')
      .upsert(row, { onConflict: 'session_id' })

    if (error) {
      const res = NextResponse.json({ success: false, error: error.message || 'Failed to store chat' }, { status: 500 })
      Object.entries(corsHeaders).forEach(([k, v]) => res.headers.set(k, v))
      return res
    }

    const res = NextResponse.json({ success: true }, { status: 200 })
    Object.entries(corsHeaders).forEach(([k, v]) => res.headers.set(k, v))
    return res
  } catch (err) {
    const res = NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
    Object.entries(corsHeaders).forEach(([k, v]) => res.headers.set(k, v))
    return res
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders })
}

