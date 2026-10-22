// Telegram group chat for the content team: Shamika, the reels creator and Claude.
//
// Two callers:
// - Telegram posts group messages here (checked with X-Telegram-Bot-Api-Secret-Token). They are
//   stored in telegram_messages; nothing is answered automatically. Claude reads them on a
//   schedule and writes replies as 'out' rows.
// - The database (x-internal-token, checked against Vault) asks to 'send' unsent replies, or to
//   'register' this function as the bot's webhook.
// Replies only go to chats marked allowed in telegram_chats. Deploy with verify_jwt = false.
//
// Secret (Supabase dashboard, never in code or chat): TELEGRAM_BOT_TOKEN from @BotFather.
// Nothing here logs a token.

import { createClient } from 'npm:@supabase/supabase-js@2.45.4'

const BOT_TOKEN = (Deno.env.get('TELEGRAM_BOT_TOKEN') ?? '').trim()
const SELF_URL = `${Deno.env.get('SUPABASE_URL')}/functions/v1/telegram-bot`
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
  auth: { persistSession: false },
})

// Telegram errors never include the token, but the URL does; keep only Telegram's description.
async function telegram(method: string, body: Record<string, unknown>) {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const out = await res.json().catch(() => ({}))
  if (!out.ok) throw new Error(String(out.description ?? `Telegram ${res.status}`))
  return out.result
}

async function sha256Hex(text: string) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function storeIncoming(update: any) {
  const msg = update.message ?? update.edited_message
  if (!msg?.chat?.id || !(msg.text ?? msg.caption)) return
  if (msg.from?.is_bot) return
  await db.from('telegram_chats').upsert(
    { chat_id: msg.chat.id, title: msg.chat.title ?? msg.chat.username ?? msg.chat.first_name ?? null },
    { onConflict: 'chat_id', ignoreDuplicates: true },
  )
  const sender = [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(' ') || msg.from?.username || null
  await db.from('telegram_messages').insert({
    chat_id: msg.chat.id,
    direction: 'in',
    sender,
    text: msg.text ?? msg.caption,
    tg_message_id: msg.message_id,
    reply_to_tg_message_id: msg.reply_to_message?.message_id ?? null,
  })
}

async function sendPending() {
  // Claiming with one UPDATE ... RETURNING means two overlapping calls never send the same reply.
  const { data: rows, error } = await db
    .from('telegram_messages')
    .update({ sent_at: new Date().toISOString() })
    .eq('direction', 'out')
    .is('sent_at', null)
    .select('id, chat_id, text, reply_to_tg_message_id')
  if (error) throw new Error(error.message)
  let sent = 0
  for (const r of rows ?? []) {
    const { data: chat } = await db.from('telegram_chats').select('allowed').eq('chat_id', r.chat_id).maybeSingle()
    try {
      if (!chat?.allowed) throw new Error('chat is not allowed')
      const result = await telegram('sendMessage', {
        chat_id: r.chat_id,
        text: r.text,
        ...(r.reply_to_tg_message_id ? { reply_parameters: { message_id: r.reply_to_tg_message_id, allow_sending_without_reply: true } } : {}),
      })
      await db.from('telegram_messages').update({ tg_message_id: result.message_id, error: null }).eq('id', r.id)
      sent++
    } catch (e) {
      await db.from('telegram_messages').update({ error: (e as Error).message }).eq('id', r.id)
    }
  }
  return sent
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('ok')
  if (!BOT_TOKEN) return new Response('TELEGRAM_BOT_TOKEN is not set', { status: 500 })

  const webhookSecret = req.headers.get('x-telegram-bot-api-secret-token') ?? ''
  if (webhookSecret) {
    const { data } = await db.rpc('telegram_check_webhook_secret', { p_secret: webhookSecret })
    if (data !== true) return new Response('Unauthorised', { status: 401 })
    try {
      await storeIncoming(await req.json())
    } catch (e) {
      console.error('telegram-bot store failed:', (e as Error).message)
    }
    return new Response('ok') // always 200 so Telegram doesn't retry forever
  }

  const internal = req.headers.get('x-internal-token') ?? ''
  const { data: ok } = await db.rpc('telegram_check_internal_token', { p_token: internal })
  if (ok !== true) return new Response('Unauthorised', { status: 401 })

  try {
    const { action } = await req.json().catch(() => ({ action: 'send' }))
    if (action === 'register') {
      await telegram('setWebhook', {
        url: SELF_URL,
        secret_token: await sha256Hex(`${internal}:webhook`),
        allowed_updates: ['message', 'edited_message'],
        drop_pending_updates: true,
      })
      const me = await telegram('getMe', {})
      return Response.json({ ok: true, bot: me.username, can_read_all_group_messages: me.can_read_all_group_messages })
    }
    return Response.json({ ok: true, sent: await sendPending() })
  } catch (e) {
    console.error('telegram-bot failed:', (e as Error).message)
    return Response.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
})
