import { getServiceClient } from '@/services/supabase.server'
import { flushApprovedMessages } from '@/services/ai-console.service'
import { sendReplyEmail } from '@/services/email.service'
import { generateOneItinerary } from '@/services/ai.service'
import { getRequest } from '@/services/request.service'
import { deliverMail, MAIN_ADDRESS, requireMailer, senderFor } from '@/services/mailer'
import { styleFromNumber, type ItineraryStyle } from '@/config/status'

/**
 * Runs AI work that the database says may go ahead. Called by the database itself
 * (pg_net, see 20261016210000_ai_dispatch.sql) when something becomes runnable, and every
 * 5 minutes while anything is waiting.
 *
 * Every action goes through ai_begin_action() first. That gate (pause switches, messaging
 * switch, human takeover, Manager/owner approval, owner-only levels) refuses anything that
 * may not run, so this file cannot widen what the agents may do. Safe to call any number of
 * times: an action is claimed once, by whichever call reaches the gate first.
 */

const ADMIN_URL = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || 'https://admin.lankalux.com'
const PING_KINDS = ['attention', 'approval_needed', 'error', 'summary']

type ActionRow = { id: string; agent_key: string; action_type: string; request_id: string | null; payload: Record<string, unknown> }

export async function checkDispatchToken(token: string | null): Promise<boolean> {
  if (!token || token.length < 32) return false
  const { data, error } = await getServiceClient().rpc('ai_check_dispatch_token', { p_token: token })
  if (error) {
    console.error('[ai-dispatch] token check failed', error.message)
    return false
  }
  return data === true
}

/** Claims an action through the gate. False means it must wait (or someone else claimed it). */
async function begin(id: string): Promise<boolean> {
  const { error } = await getServiceClient().rpc('ai_begin_action', { p_action_id: id })
  if (error) console.log('[ai-dispatch] waiting', id, error.message)
  return !error
}

async function finish(id: string, ok: boolean, result: Record<string, unknown> | null, err: string | null) {
  const { error } = await getServiceClient().rpc('ai_finish_action', { p_action_id: id, p_ok: ok, p_result: result, p_error: err })
  if (error) console.error('[ai-dispatch] finish failed', id, error.message)
}

async function notify(kind: string, title: string, body: string, requestId: string | null, actionId: string | null) {
  const { error } = await getServiceClient()
    .from('ai_notifications')
    .insert({ kind, title: title.slice(0, 200), body: body.slice(0, 4000), request_id: requestId, action_id: actionId })
  if (error) console.error('[ai-dispatch] notification failed', error.message)
}

/** Approved follow-up emails, sent from hello@ on the request's email thread. */
export async function runEmailFollowUps() {
  const db = getServiceClient()
  const { data, error } = await db
    .from('ai_approvals')
    .select('action_id, ai_actions!inner(id, agent_key, action_type, request_id, payload, status)')
    .eq('decision', 'approve')
    .eq('ai_actions.status', 'proposed')
    .eq('ai_actions.action_type', 'message.follow_up')
    .limit(10)
  if (error) throw new Error(`Could not read approved follow-ups: ${error.message}`)
  const seen = new Set<string>()
  const out = { sent: 0, waiting: 0, failed: 0 }
  for (const row of data || []) {
    const a = (row as unknown as { ai_actions: ActionRow }).ai_actions
    if (seen.has(a.id)) continue
    seen.add(a.id)
    if (a.payload?.channel !== 'email' || !a.request_id) continue
    if (!(await begin(a.id))) {
      out.waiting++
      continue
    }
    try {
      const sent = await sendReplyEmail({
        requestId: a.request_id,
        subject: String(a.payload.subject || '') || undefined,
        body: await approvedText(a.id, String(a.payload.body || '')),
        sender: { email: MAIN_ADDRESS, name: 'LankaLux' },
      })
      await finish(a.id, true, { to: sent.to, subject: sent.subject }, null)
      out.sent++
    } catch (err) {
      await finish(a.id, false, null, err instanceof Error ? err.message : String(err))
      out.failed++
    }
  }
  return out
}

/** The owner may have edited the draft when approving; the latest edit wins. */
async function approvedText(actionId: string, fallback: string) {
  const { data } = await getServiceClient()
    .from('ai_approvals')
    .select('edited_payload')
    .eq('action_id', actionId)
    .eq('decided_by_kind', 'owner')
    .eq('decision', 'approve')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const edited = (data?.edited_payload as { text?: unknown } | null)?.text
  return typeof edited === 'string' && edited.trim() ? edited : fallback
}

/** One itinerary draft per call (each takes up to a minute with OpenAI). */
async function runItineraries() {
  const { data, error } = await getServiceClient()
    .from('ai_actions')
    .select('id, agent_key, action_type, request_id, payload')
    .eq('status', 'proposed')
    .eq('action_type', 'itinerary.generate')
    .order('created_at', { ascending: true })
    .limit(1)
  if (error) throw new Error(`Could not read itinerary requests: ${error.message}`)
  const a = (data || [])[0] as ActionRow | undefined
  if (!a || !a.request_id) return { generated: 0 }
  if (!(await begin(a.id))) return { generated: 0, waiting: 1 }
  try {
    const n = [1, 2, 3].includes(Number(a.payload?.option)) ? (Number(a.payload.option) as 1 | 2 | 3) : 1
    const style = (a.payload?.style as ItineraryStyle) || styleFromNumber(n)
    const request = await getRequest(a.request_id)
    const itinerary = await generateOneItinerary({ request, optionNumber: n, style, actor: 'AI Travel Planner' })
    await finish(a.id, true, { option: n, style, title: (itinerary as { title?: string }).title ?? null }, null)
    await notify(
      'info',
      `Draft itinerary ready for ${request.client_name || a.request_id}`,
      'The AI Travel Planner drafted option 1. Review it on the request before sending.',
      a.request_id,
      a.id
    )
    return { generated: 1 }
  } catch (err) {
    await finish(a.id, false, null, err instanceof Error ? err.message : String(err))
    return { generated: 0, failed: 1 }
  }
}

function esc(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)
}

/** Emails new pings to hello@ (one email per run, listing them all). */
async function emailPings() {
  const db = getServiceClient()
  const { data, error } = await db
    .from('ai_notifications')
    .select('id, kind, title, body, request_id, created_at')
    .is('emailed_at', null)
    .in('kind', PING_KINDS)
    .gte('created_at', new Date(Date.now() - 24 * 3600 * 1000).toISOString())
    .order('created_at', { ascending: true })
    .limit(20)
  if (error) throw new Error(`Could not read pings: ${error.message}`)
  const rows = data || []
  if (!rows.length) return { emailed: 0 }
  requireMailer()
  // Claim them first, so two overlapping runs never email the same ping twice.
  const { data: claimed } = await db
    .from('ai_notifications')
    .update({ emailed_at: new Date().toISOString() })
    .in('id', rows.map((r) => r.id))
    .is('emailed_at', null)
    .select('id')
  const ids = new Set((claimed || []).map((r) => r.id))
  const list = rows.filter((r) => ids.has(r.id))
  if (!list.length) return { emailed: 0 }

  const needYou = list.filter((r) => r.kind !== 'summary')
  const subject =
    needYou.length === 0
      ? list[0].title
      : needYou.length === 1
        ? `AI: ${needYou[0].title}`
        : `AI: ${needYou.length} things need you`
  const link = `${ADMIN_URL}/console/ai`
  const text = [
    ...list.flatMap((r) => [r.title, r.body || '', r.request_id ? `${ADMIN_URL}/console/requests/${r.request_id}` : '', '']),
    `Open the AI control room: ${link}`,
  ].join('\n')
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#252523">${list
    .map(
      (r) =>
        `<p style="margin:0 0 18px"><strong>${esc(r.title)}</strong><br/>${esc(r.body || '').replace(/\n/g, '<br/>')}${
          r.request_id ? `<br/><a href="${ADMIN_URL}/console/requests/${encodeURIComponent(r.request_id)}">Open the request</a>` : ''
        }</p>`
    )
    .join('')}<p><a href="${link}" style="color:#B18544">Open the AI control room</a></p></div>`
  await deliverMail({ from: senderFor(null), to: MAIN_ADDRESS, subject, text, html })
  return { emailed: list.length }
}

async function step<T>(name: string, fn: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await fn()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[ai-dispatch] ${name} failed`, message)
    return { error: message }
  }
}

export async function dispatchAll() {
  return {
    whatsapp: await step('whatsapp', flushApprovedMessages),
    email: await step('email', runEmailFollowUps),
    pings: await step('pings', emailPings),
    itineraries: await step('itineraries', runItineraries),
  }
}
