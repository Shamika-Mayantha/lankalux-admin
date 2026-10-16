// Sends approved WhatsApp replies through the WhatsApp Cloud API.
//
// The admin console calls this after the owner approves a reply (and when the AI system
// is started or customer messaging is switched on), with the server-side service key.
// It takes no message input: it looks for approved message actions and runs each one
// through ai_begin_action(), the same database gate the agents use, so nothing can be
// sent here that the gate (pause switches, messaging switch, takeover, owner approval)
// would refuse. Deploy with verify_jwt = false; the bearer check below is the auth.
//
// Secrets (Supabase dashboard, never in code or chat): WHATSAPP_TOKEN (a System User
// token), WHATSAPP_PHONE_NUMBER_ID. SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are built in.

import { createClient } from 'npm:@supabase/supabase-js@2.45.4'

const GRAPH = 'https://graph.facebook.com/v26.0'
const TOKEN = (Deno.env.get('WHATSAPP_TOKEN') ?? '').trim()
const PHONE_ID = (Deno.env.get('WHATSAPP_PHONE_NUMBER_ID') ?? '').trim()
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const db = createClient(Deno.env.get('SUPABASE_URL')!, SERVICE_KEY, { auth: { persistSession: false } })

type Action = { id: string; agent_key: string; action_type: string; conversation_id: string | null; payload: Record<string, unknown> }

function serviceKeys(): string[] {
  const keys = [SERVICE_KEY]
  // Projects on the newer API keys also expose them here (JSON object of name -> key).
  try {
    Object.values(JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}')).forEach((k) => typeof k === 'string' && keys.push(k))
  } catch { /* not set */ }
  return keys.filter(Boolean)
}

async function authorised(req: Request) {
  const bearer = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!bearer) return false
  if (serviceKeys().includes(bearer)) return true
  // The admin may hold a different server key format than this runtime sees; accept any key
  // that can use the Auth admin API, which only secret/service-role keys can.
  const probe = createClient(Deno.env.get('SUPABASE_URL')!, bearer, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error } = await probe.auth.admin.listUsers({ page: 1, perPage: 1 })
  return !error
}

async function finish(id: string, ok: boolean, result: Record<string, unknown> | null, error: string | null) {
  const { error: err } = await db.rpc('ai_finish_action', { p_action_id: id, p_ok: ok, p_result: result, p_error: error })
  if (err) console.error('whatsapp-send finish failed', id, err.message)
}

async function textFor(a: Action): Promise<string> {
  // The owner may have edited the draft when approving; the latest edit wins.
  const { data } = await db
    .from('ai_approvals')
    .select('edited_payload')
    .eq('action_id', a.id)
    .eq('decided_by_kind', 'owner')
    .eq('decision', 'approve')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const edited = (data?.edited_payload as { text?: unknown } | null)?.text
  return String(typeof edited === 'string' && edited.trim() ? edited : a.payload.text ?? '').trim()
}

async function send(a: Action): Promise<'sent' | 'waiting' | 'failed'> {
  const { error: gateErr } = await db.rpc('ai_begin_action', { p_action_id: a.id })
  if (gateErr) {
    console.log('whatsapp-send waiting', a.id, gateErr.message)
    return 'waiting'
  }
  // From here the action is 'executing': always close it, or it would never be retried or shown.
  try {
    return await deliver(a)
  } catch (err) {
    await finish(a.id, false, null, err instanceof Error ? err.message : String(err))
    return 'failed'
  }
}

async function deliver(a: Action): Promise<'sent' | 'failed'> {
  const { data: conv } = await db
    .from('ai_conversations')
    .select('id, channel, external_id, service_window_expires_at')
    .eq('id', a.conversation_id!)
    .maybeSingle()
  if (!conv || conv.channel !== 'whatsapp') {
    await finish(a.id, false, null, 'Conversation not found')
    return 'failed'
  }
  if (!conv.service_window_expires_at || new Date(conv.service_window_expires_at) <= new Date()) {
    await finish(a.id, false, null, 'The customer last wrote over 24 hours ago; WhatsApp only allows an approved template now.')
    return 'failed'
  }

  const text = await textFor(a)
  if (!text) {
    await finish(a.id, false, null, 'Empty message')
    return 'failed'
  }

  const res = await fetch(`${GRAPH}/${PHONE_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: conv.external_id, type: 'text', text: { body: text.slice(0, 4096) } }),
  })
  const body = await res.json().catch(() => ({}))
  const wamid: string | undefined = body?.messages?.[0]?.id

  const { error: msgErr } = await db.from('ai_messages').insert({
    conversation_id: conv.id,
    direction: 'outbound',
    sender_kind: 'ai',
    agent_key: a.agent_key,
    action_id: a.id,
    body: text,
    provider_message_id: wamid ?? null,
    status: res.ok && wamid ? 'sent' : 'failed',
    metadata: res.ok ? {} : { error: body?.error?.message ?? `HTTP ${res.status}` },
  })
  if (msgErr) console.error('whatsapp-send could not record the message', a.id, msgErr.message)

  if (!res.ok || !wamid) {
    await finish(a.id, false, null, `WhatsApp refused the message: ${body?.error?.message ?? `HTTP ${res.status}`}`)
    return 'failed'
  }
  await finish(a.id, true, { provider_message_id: wamid }, null)
  return 'sent'
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  if (!(await authorised(req))) return new Response('Unauthorized', { status: 401 })
  if (!TOKEN || !PHONE_ID) return Response.json({ error: 'WhatsApp sending is not set up yet.' }, { status: 503 })

  // Message actions an owner (or the AI Manager) has approved and that have not run yet.
  const { data: approved, error } = await db
    .from('ai_approvals')
    .select('action_id, ai_actions!inner(id, agent_key, action_type, conversation_id, payload, status)')
    .eq('decision', 'approve')
    .eq('ai_actions.status', 'proposed')
    .like('ai_actions.action_type', 'message.%')
    .not('ai_actions.conversation_id', 'is', null)
    .order('created_at', { ascending: true })
    .limit(20)
  if (error) {
    console.error('whatsapp-send query failed', error.message)
    return Response.json({ error: 'Could not read approved messages.' }, { status: 500 })
  }

  const seen = new Set<string>()
  const results: Record<string, string> = {}
  for (const row of approved ?? []) {
    const a = (row as unknown as { ai_actions: Action }).ai_actions
    if (seen.has(a.id)) continue
    seen.add(a.id)
    try {
      results[a.id] = await send(a)
    } catch (err) {
      console.error('whatsapp-send failed', a.id, err instanceof Error ? err.message : err)
      results[a.id] = 'error'
    }
  }
  return Response.json({ results })
})
