import { appUrl } from '@/config/env'
import { normalizeStatus, type RequestStatus } from '@/config/status'
import { deliverMail, MAIN_ADDRESS, requireMailer, senderFor } from '@/services/mailer'
import { getServiceClient, AppError, isMissingTableError } from '@/services/supabase.server'
import { isSupervisor, type Staff } from '@/services/staff.service'

/**
 * Enquiries that need a nudge, worked out from data admin already keeps (no new tables):
 *
 * - "reply": the client is waiting on us. Their enquiry or their last email came in more
 *   than REPLY_AFTER_HOURS ago and nothing has gone out to them since (email or WhatsApp).
 * - "chase": we are waiting on the client. Our last message on an open enquiry went out
 *   more than CHASE_AFTER_DAYS ago with no reply, so a polite follow-up may help.
 *
 * Both stop after GIVE_UP_DAYS, so old leads don't sit on the list for ever.
 */

export const REPLY_AFTER_HOURS = 24
export const CHASE_AFTER_DAYS = 3
const GIVE_UP_DAYS = 30
const HOUR = 3600_000
const DAY = 24 * HOUR

/** The template the one-click follow-up sends ("Whenever You Are Ready To Continue"). */
export const CHASE_TEMPLATE_ID = 'gentle_reminder'

const REPLY_STATUSES: RequestStatus[] = ['new', 'follow_up', 'sold', 'after_sales']
const CHASE_STATUSES: RequestStatus[] = ['follow_up']

export type FollowUpKind = 'reply' | 'chase'

export type FollowUpItem = {
  requestId: string
  clientName: string
  email: string | null
  status: RequestStatus
  kind: FollowUpKind
  /** When the client last wrote (reply) or when we last wrote (chase). */
  since: string
  hoursWaiting: number
  ownerId: string | null
}

type RequestRow = {
  id: string
  client_name: string | null
  email: string | null
  status: string | null
  created_at: string | null
  last_sent_at: string | null
  follow_up_emails_sent: string | null
  created_by: string | null
  assigned_agent_id: string | null
}

function latest(...values: (string | null | undefined)[]): number {
  let best = 0
  for (const v of values) {
    const t = v ? Date.parse(v) : NaN
    if (Number.isFinite(t) && t > best) best = t
  }
  return best
}

function lastFollowUpLogAt(raw: string | null): string | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return null
    return parsed.reduce<string | null>((acc, e) => (e?.sent_at && (!acc || e.sent_at > acc) ? e.sent_at : acc), null)
  } catch {
    return null
  }
}

/** Every enquiry that needs a nudge, oldest wait first. Agents only get their own requests. */
export async function listFollowUps(staff?: Staff | null, now = Date.now()): Promise<FollowUpItem[]> {
  const supabase = getServiceClient()
  const since = new Date(now - GIVE_UP_DAYS * DAY - DAY).toISOString()

  let query = supabase
    .from('Client Requests')
    .select('id, client_name, email, status, created_at, last_sent_at, follow_up_emails_sent, created_by, assigned_agent_id')
    .in('status', [...new Set([...REPLY_STATUSES, ...CHASE_STATUSES])])
    .limit(1000)
  if (staff && !isSupervisor(staff)) query = query.or(`created_by.eq.${staff.id},assigned_agent_id.eq.${staff.id}`)
  const { data: requests, error } = await query
  if (error) throw new AppError(`Supabase request failed: ${error.message}`, 500)
  const rows = (requests || []) as RequestRow[]
  if (!rows.length) return []

  // Latest message each way per request, from the communications log.
  const lastIn = new Map<string, string>()
  const lastOut = new Map<string, string>()
  const { data: comms, error: commsError } = await supabase
    .from('communications')
    .select('request_id, direction, status, created_at')
    .in('request_id', rows.map((r) => r.id))
    .gte('created_at', since)
  if (commsError && !isMissingTableError(commsError)) {
    throw new AppError(`Supabase request failed: ${commsError.message}`, 500)
  }
  for (const c of comms || []) {
    const id = String(c.request_id)
    const at = String(c.created_at)
    if (c.direction === 'inbound') {
      if (!lastIn.has(id) || at > lastIn.get(id)!) lastIn.set(id, at)
    } else if (c.status === 'sent') {
      if (!lastOut.has(id) || at > lastOut.get(id)!) lastOut.set(id, at)
    }
  }

  const items: FollowUpItem[] = []
  for (const r of rows) {
    const status = normalizeStatus(r.status)
    if (!status) continue
    const clientAt = latest(r.created_at, lastIn.get(r.id))
    const teamAt = latest(lastOut.get(r.id), r.last_sent_at, lastFollowUpLogAt(r.follow_up_emails_sent))
    const base = {
      requestId: r.id,
      clientName: r.client_name || r.email || r.id,
      email: r.email,
      status,
      ownerId: r.assigned_agent_id || r.created_by || null,
    }

    if (clientAt > teamAt) {
      const waited = now - clientAt
      if (REPLY_STATUSES.includes(status) && waited >= REPLY_AFTER_HOURS * HOUR && waited <= GIVE_UP_DAYS * DAY) {
        items.push({ ...base, kind: 'reply', since: new Date(clientAt).toISOString(), hoursWaiting: Math.floor(waited / HOUR) })
      }
    } else if (teamAt) {
      const waited = now - teamAt
      if (CHASE_STATUSES.includes(status) && r.email && waited >= CHASE_AFTER_DAYS * DAY && waited <= GIVE_UP_DAYS * DAY) {
        items.push({ ...base, kind: 'chase', since: new Date(teamAt).toISOString(), hoursWaiting: Math.floor(waited / HOUR) })
      }
    }
  }

  // Clients waiting on us first, then the longest waits.
  return items.sort((a, b) => (a.kind === b.kind ? b.hoursWaiting - a.hoursWaiting : a.kind === 'reply' ? -1 : 1))
}

function waitLabel(hours: number) {
  return hours < 48 ? `${hours} hours` : `${Math.floor(hours / 24)} days`
}

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function digest(items: FollowUpItem[], intro: string) {
  const link = (id: string) => `${appUrl()}/console/requests/${encodeURIComponent(id)}`
  const reply = items.filter((i) => i.kind === 'reply')
  const chase = items.filter((i) => i.kind === 'chase')
  const section = (title: string, list: FollowUpItem[], verb: string) =>
    list.length
      ? {
          text: [title, ...list.map((i) => `- ${i.clientName} (${i.requestId}), ${verb} ${waitLabel(i.hoursWaiting)}: ${link(i.requestId)}`), ''],
          html: `<h3 style="font-size:15px;margin:18px 0 6px">${escapeHtml(title)}</h3><ul style="padding-left:18px;margin:0">${list
            .map(
              (i) =>
                `<li style="margin:4px 0"><a href="${link(i.requestId)}">${escapeHtml(i.clientName)}</a> (${escapeHtml(i.requestId)}), ${verb} ${waitLabel(i.hoursWaiting)}</li>`
            )
            .join('')}</ul>`,
        }
      : { text: [], html: '' }
  const a = section('Clients waiting for a reply', reply, 'waiting')
  const b = section('Clients to follow up (one click from the Requests page)', chase, 'quiet for')
  const text = [intro, '', ...a.text, ...b.text, `All of them: ${appUrl()}/console/requests`].join('\n')
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#252523;line-height:1.6">
<p>${escapeHtml(intro)}</p>${a.html}${b.html}
<p style="margin-top:18px"><a href="${appUrl()}/console/requests">Open the follow-up list in admin</a></p>
</div>`
  return { text, html }
}

/**
 * The daily reminder: each agent gets their own list, and hello@ gets everything.
 * At most one email per staff member per run, so it stays well inside Resend's daily limit.
 */
export async function sendFollowUpReminders(now = Date.now()) {
  requireMailer()
  const items = await listFollowUps(null, now)
  if (!items.length) return { items: 0, sent: [] as string[] }

  const supabase = getServiceClient()
  const ownerIds = [...new Set(items.map((i) => i.ownerId).filter((v): v is string => Boolean(v)))]
  const emails = new Map<string, { email: string; name: string }>()
  if (ownerIds.length) {
    const { data } = await supabase.from('admin_users').select('user_id, email, full_name, active').in('user_id', ownerIds)
    for (const s of data || []) {
      if (s.active && s.email) emails.set(String(s.user_id), { email: String(s.email).toLowerCase(), name: s.full_name || '' })
    }
  }

  const byRecipient = new Map<string, FollowUpItem[]>()
  byRecipient.set(MAIN_ADDRESS, items)
  for (const item of items) {
    const owner = item.ownerId ? emails.get(item.ownerId) : null
    if (!owner || owner.email === MAIN_ADDRESS) continue
    byRecipient.set(owner.email, [...(byRecipient.get(owner.email) || []), item])
  }

  const sent: string[] = []
  for (const [to, list] of byRecipient) {
    const replies = list.filter((i) => i.kind === 'reply').length
    const subject = replies
      ? `${replies} ${replies === 1 ? 'client is' : 'clients are'} waiting for a reply`
      : `${list.length} ${list.length === 1 ? 'enquiry' : 'enquiries'} to follow up`
    const intro =
      to === MAIN_ADDRESS
        ? 'Here are the enquiries across the team that need a nudge today.'
        : 'Here are your enquiries that need a nudge today.'
    const { text, html } = digest(list, intro)
    try {
      await deliverMail({ from: senderFor(null), to, subject, text, html })
      sent.push(to)
    } catch (err) {
      console.error('[follow-ups] reminder failed for', to, err instanceof Error ? err.message : err)
    }
  }
  return { items: items.length, sent }
}
