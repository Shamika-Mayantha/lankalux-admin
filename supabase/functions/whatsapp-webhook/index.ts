// Receives WhatsApp Cloud API webhooks from Meta and records them for the AI agents.
//
// GET  = Meta's one-time verification (hub.verify_token must equal WHATSAPP_VERIFY_TOKEN).
// POST = message and status updates, accepted only with a valid X-Hub-Signature-256
//        (HMAC-SHA256 of the raw body with WHATSAPP_APP_SECRET).
//
// Inbound messages go into ai_conversations / ai_messages plus one ai_event each, so the
// agent service picks them up. Nothing is sent from here. Deploy with verify_jwt = false
// (Meta cannot send a Supabase JWT); the signature check is the authentication.
// Secrets (set in the Supabase dashboard, never in code): WHATSAPP_VERIFY_TOKEN,
// WHATSAPP_APP_SECRET. SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.

import { createClient } from 'npm:@supabase/supabase-js@2.45.4'

const VERIFY_TOKEN = Deno.env.get('WHATSAPP_VERIFY_TOKEN') ?? ''
const APP_SECRET = Deno.env.get('WHATSAPP_APP_SECRET') ?? ''
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
})

type WaMessage = {
  id: string
  from: string
  timestamp?: string
  type: string
  text?: { body?: string }
  button?: { text?: string }
  interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } }
  image?: { caption?: string }
  document?: { caption?: string; filename?: string }
  location?: { latitude?: number; longitude?: number; name?: string }
}
type WaStatus = { id: string; status: string; errors?: unknown[] }
type WaValue = {
  metadata?: { phone_number_id?: string }
  contacts?: { wa_id: string; profile?: { name?: string } }[]
  messages?: WaMessage[]
  statuses?: WaStatus[]
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

async function validSignature(raw: string, header: string | null) {
  if (!APP_SECRET || !header?.startsWith('sha256=')) return false
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(APP_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw)))
  const hex = Array.from(mac, (b) => b.toString(16).padStart(2, '0')).join('')
  return timingSafeEqual(hex, header.slice(7))
}

function messageText(m: WaMessage): string {
  switch (m.type) {
    case 'text': return m.text?.body ?? ''
    case 'button': return m.button?.text ?? '[button]'
    case 'interactive': return m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? '[interactive]'
    case 'image': return m.image?.caption ? `[image] ${m.image.caption}` : '[image]'
    case 'document': return `[document] ${m.document?.filename ?? ''}`.trim()
    case 'location': return `[location] ${m.location?.name ?? ''} ${m.location?.latitude ?? ''},${m.location?.longitude ?? ''}`.trim()
    default: return `[${m.type}]`
  }
}

async function recordMessage(m: WaMessage, value: WaValue) {
  const name = value.contacts?.find((c) => c.wa_id === m.from)?.profile?.name ?? null
  const at = m.timestamp ? new Date(Number(m.timestamp) * 1000) : new Date()
  const windowEnds = new Date(at.getTime() + 24 * 60 * 60 * 1000).toISOString()

  const { data: conv, error: convErr } = await db
    .from('ai_conversations')
    .upsert(
      {
        channel: 'whatsapp',
        external_id: m.from,
        ...(name ? { customer_name: name } : {}),
        last_message_at: at.toISOString(),
        service_window_expires_at: windowEnds,
      },
      { onConflict: 'channel,external_id' },
    )
    .select('id, request_id')
    .single()
  if (convErr) throw convErr

  const { data: msg, error: msgErr } = await db
    .from('ai_messages')
    .insert({
      conversation_id: conv.id,
      direction: 'inbound',
      sender_kind: 'customer',
      body: messageText(m).slice(0, 4000),
      provider_message_id: m.id,
      status: 'received',
      metadata: { type: m.type, phone_number_id: value.metadata?.phone_number_id ?? null },
    })
    .select('id')
    .maybeSingle()
  // A repeated delivery of the same message hits the unique provider id: already recorded.
  if (msgErr) {
    if ((msgErr as { code?: string }).code === '23505') return
    throw msgErr
  }

  const { error: evErr } = await db.from('ai_events').insert({
    event_type: 'whatsapp.message_received',
    source_table: 'ai_messages',
    source_id: msg!.id,
    request_id: conv.request_id,
    payload: { conversation_id: conv.id, from: m.from, type: m.type },
    dedupe_key: `wa:${m.id}`,
  })
  if (evErr && (evErr as { code?: string }).code !== '23505') throw evErr
}

async function recordStatus(s: WaStatus) {
  const allowed = ['sent', 'delivered', 'read', 'failed']
  if (!allowed.includes(s.status)) return
  const { error } = await db.from('ai_messages').update({ status: s.status }).eq('provider_message_id', s.id)
  if (error) throw error
}

Deno.serve(async (req) => {
  const url = new URL(req.url)

  if (req.method === 'GET') {
    const ok = url.searchParams.get('hub.mode') === 'subscribe' && VERIFY_TOKEN !== '' &&
      timingSafeEqual(url.searchParams.get('hub.verify_token') ?? '', VERIFY_TOKEN)
    return ok ? new Response(url.searchParams.get('hub.challenge') ?? '', { status: 200 }) : new Response('Forbidden', { status: 403 })
  }
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const raw = await req.text()
  if (!(await validSignature(raw, req.headers.get('x-hub-signature-256')))) {
    return new Response('Invalid signature', { status: 401 })
  }

  let body: { entry?: { changes?: { field?: string; value?: WaValue }[] }[] }
  try {
    body = JSON.parse(raw)
  } catch {
    return new Response('Bad JSON', { status: 400 })
  }

  try {
    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        if (change.field !== 'messages' || !change.value) continue
        for (const m of change.value.messages ?? []) await recordMessage(m, change.value)
        for (const s of change.value.statuses ?? []) await recordStatus(s)
      }
    }
  } catch (err) {
    // Meta retries non-2xx deliveries, and the unique ids make retries safe.
    console.error('whatsapp-webhook failed', err instanceof Error ? err.message : err)
    return new Response('Temporary failure', { status: 500 })
  }
  return new Response('OK', { status: 200 })
})
