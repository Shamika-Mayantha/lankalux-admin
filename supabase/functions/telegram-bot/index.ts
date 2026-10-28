// Telegram group chat for the content team: Shamika, the reels creator and Claude.
//
// Two callers:
// - Telegram posts group messages here (checked with X-Telegram-Bot-Api-Secret-Token). They are
//   stored in telegram_messages (photos and videos also in telegram_media, so Claude can review
//   them) and, when CLAUDE_TELEGRAM_FIRE_TOKEN is set, wake the Claude
//   replies task (at most once per cooldown). Claude also reads them on a schedule and writes
//   replies as 'out' rows.
// - The database (x-internal-token, checked against Vault) asks to 'send' unsent replies, to
//   'register' this function as the bot's webhook, or for 'info' on webhook health.
// Replies only go to chats marked allowed in telegram_chats. Deploy with verify_jwt = false.
//
// Secrets (Supabase dashboard, never in code or chat): TELEGRAM_BOT_TOKEN from @BotFather, and
// optionally CLAUDE_TELEGRAM_FIRE_TOKEN so a new group message wakes the Claude replies task.
// Nothing here logs a token.

import { createClient } from 'npm:@supabase/supabase-js@2.45.4'
import { encodeBase64 } from 'jsr:@std/encoding@1/base64'

const BOT_TOKEN = (Deno.env.get('TELEGRAM_BOT_TOKEN') ?? '').trim()
const SELF_URL = `${Deno.env.get('SUPABASE_URL')}/functions/v1/telegram-bot`
// Same token as the admin "Ask Claude now" button (Vercel CLAUDE_TELEGRAM_FIRE_TOKEN); unset = no wake.
const FIRE_TOKEN = (Deno.env.get('CLAUDE_TELEGRAM_FIRE_TOKEN') ?? '').trim()
const FIRE_URL = 'https://api.anthropic.com/v1/claude_code/routines/trig_015EpDbTmPazQ1EnAZj4tWCR/fire'
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

// The largest file the Bot API lets a bot download.
const MAX_DOWNLOAD = 20 * 1024 * 1024

// Picks the photo or video in a message, if any. Creators often send "as file" to keep quality,
// so image and video documents count too.
function mediaOf(msg: any) {
  if (msg.photo?.length) {
    const p = msg.photo[msg.photo.length - 1]
    return { kind: 'photo', file: p, mime: 'image/jpeg', width: p.width, height: p.height }
  }
  const v = msg.video ?? msg.animation ?? msg.video_note
  if (v) return { kind: 'video', file: v, mime: v.mime_type ?? 'video/mp4', width: v.width ?? v.length, height: v.height ?? v.length, duration: v.duration, thumb: v.thumbnail ?? v.thumb }
  const d = msg.document
  if (d && /^(image|video)\//.test(d.mime_type ?? '')) {
    return { kind: d.mime_type.startsWith('image/') ? 'photo' : 'video', file: d, mime: d.mime_type, thumb: d.thumbnail ?? d.thumb }
  }
  return null
}

async function download(fileId: string) {
  const f = await telegram('getFile', { file_id: fileId })
  const res = await fetch(`https://api.telegram.org/file/bot${BOT_TOKEN}/${f.file_path}`)
  if (!res.ok) throw new Error(`file download ${res.status}`)
  return encodeBase64(new Uint8Array(await res.arrayBuffer()))
}

// Keeps a copy of the photo or video so Claude can review it; too-big videos keep their cover frame.
async function storeMedia(messageId: number, media: any, fileName: string | null) {
  const size = media.file.file_size ?? 0
  const row = {
    message_id: messageId, kind: media.kind, mime: media.mime, file_name: fileName,
    width: media.width ?? null, height: media.height ?? null, duration_seconds: media.duration ?? null, size_bytes: size || null,
  }
  if (size <= MAX_DOWNLOAD) {
    await db.from('telegram_media').insert({ ...row, b64: await download(media.file.file_id) })
  } else if (media.thumb) {
    await db.from('telegram_media').insert({
      ...row, kind: 'video_thumb', mime: 'image/jpeg', width: media.thumb.width, height: media.thumb.height,
      b64: await download(media.thumb.file_id), note: 'file over 20 MB, only the cover frame was saved',
    })
  } else {
    await db.from('telegram_media').insert({ ...row, note: 'file over 20 MB, not saved' })
  }
}

async function storeIncoming(update: any) {
  const msg = update.message ?? update.edited_message
  if (!msg?.chat?.id || msg.from?.is_bot) return
  const media = mediaOf(msg)
  const text = msg.text ?? msg.caption ?? (media ? `[${media.kind} with no caption]` : null)
  if (!text) return
  await db.from('telegram_chats').upsert(
    { chat_id: msg.chat.id, title: msg.chat.title ?? msg.chat.username ?? msg.chat.first_name ?? null },
    { onConflict: 'chat_id', ignoreDuplicates: true },
  )
  const sender = [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(' ') || msg.from?.username || null
  const { data: saved } = await db.from('telegram_messages').insert({
    chat_id: msg.chat.id,
    direction: 'in',
    sender,
    text,
    tg_message_id: msg.message_id,
    reply_to_tg_message_id: msg.reply_to_message?.message_id ?? null,
  }).select('id').single()
  if (media && saved && update.message) {
    try {
      await storeMedia(saved.id, media, msg.document?.file_name ?? null)
    } catch (e) {
      console.error('telegram-bot media failed:', (e as Error).message)
    }
  }
  if (update.message) await wakeClaude(msg.chat.id, sender)
}

// Starts the Claude replies task now instead of at its next scheduled check. The database decides
// (allowed chat, cooldown, no admin button run in progress), so a burst of messages fires once.
async function wakeClaude(chatId: number, sender: string | null) {
  if (!FIRE_TOKEN) return
  const { data: claimed } = await db.rpc('telegram_claim_wake', { p_chat_id: chatId })
  if (claimed !== true) return
  const res = await fetch(FIRE_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${FIRE_TOKEN}`,
      'anthropic-beta': 'experimental-cc-routine-2026-04-01',
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(8000),
    body: JSON.stringify({ text: `Woken by a new Telegram message from ${sender ?? 'someone'} in the content group (TELEGRAM WAKE).` }),
  })
  if (!res.ok) console.error('telegram-bot wake failed:', res.status)
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
    if (action === 'info') {
      // Delivery health only; the webhook URL and secret are left out.
      const info = await telegram('getWebhookInfo', {})
      return Response.json({
        ok: true,
        pending_update_count: info.pending_update_count,
        last_error_date: info.last_error_date ?? null,
        last_error_message: info.last_error_message ?? null,
        url_host: info.url ? new URL(info.url).host : null,
      })
    }
    return Response.json({ ok: true, sent: await sendPending() })
  } catch (e) {
    console.error('telegram-bot failed:', (e as Error).message)
    return Response.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
})
