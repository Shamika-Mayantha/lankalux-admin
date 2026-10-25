import { AppError, getServiceClient } from '@/services/supabase.server'
import type { Staff } from '@/services/staff.service'
import { logOwner } from '@/services/ai-console.service'
import { createWebsiteRequest } from '@/services/request-intake.service'
import { mapWebsiteLead } from '@/lib/website-lead'

/**
 * The Lead Scout's finds (ai_leads) and every email the AI wrote, for the AI page. Server-only:
 * every caller is a supervisor route. Nothing here posts or emails anyone; the owner replies to a
 * lead from the LankaLux account and records it here.
 */

export type AiLeadStatus = 'new' | 'replied' | 'not_relevant' | 'converted'

export type AiLead = {
  id: string
  source: 'reddit' | 'feed'
  source_detail: string | null
  url: string
  title: string
  author: string | null
  posted_at: string | null
  excerpt: string
  score: number | null
  summary: string | null
  details: { dates?: string; party?: string; places?: string[]; budget?: string; interests?: string }
  draft_reply: string | null
  reason: string | null
  quality_notes: { level: 'hard' | 'soft'; note: string }[]
  status: AiLeadStatus
  request_id: string | null
  found_at: string
  handled_at: string | null
}

export type AiLeadScan = {
  status: string
  finished_at: string | null
  error: string | null
  result: Record<string, unknown> | null
}

export type AiLeadList = {
  leads: AiLead[]
  /** New leads the model scored below the bar (hidden unless the owner shows everything). */
  weak: number
  /** New leads the model has not read yet. */
  unread: number
  lastScan: AiLeadScan | null
}

/** Leads scored below this are probably not worth a reply; they stay in the table, out of the way. */
export const LEAD_MIN_SCORE = 40

const LEAD_COLUMNS =
  'id, source, source_detail, url, title, author, posted_at, excerpt, score, summary, details, draft_reply, reason, quality_notes, status, request_id, found_at, handled_at'

export async function listAiLeads(view: unknown): Promise<AiLeadList> {
  const db = getServiceClient()
  let q = db.from('ai_leads').select(LEAD_COLUMNS)
  if (view === 'all') q = q.not('score', 'is', null).order('found_at', { ascending: false })
  else
    q = q
      .eq('status', 'new')
      .gte('score', LEAD_MIN_SCORE)
      .order('score', { ascending: false })
      .order('found_at', { ascending: false })
  const [rows, weak, unread, scan] = await Promise.all([
    q.limit(100),
    db.from('ai_leads').select('id', { count: 'exact', head: true }).eq('status', 'new').lt('score', LEAD_MIN_SCORE),
    db.from('ai_leads').select('id', { count: 'exact', head: true }).eq('status', 'new').is('score', null),
    db
      .from('ai_tasks')
      .select('status, finished_at, error, result')
      .eq('agent_key', 'scout')
      .eq('task_type', 'scan_for_leads')
      .in('status', ['succeeded', 'failed'])
      .order('finished_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])
  if (rows.error) throw new AppError(`Could not load leads: ${rows.error.message}`, 500)
  return {
    leads: (rows.data || []) as AiLead[],
    weak: weak.count || 0,
    unread: unread.count || 0,
    lastScan: (scan.data as AiLeadScan | null) ?? null,
  }
}

async function getLead(id: string): Promise<AiLead> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new AppError('Lead not found.', 404)
  const { data, error } = await getServiceClient().from('ai_leads').select(LEAD_COLUMNS).eq('id', id).maybeSingle()
  if (error) throw new AppError(`Could not load the lead: ${error.message}`, 500)
  if (!data) throw new AppError('Lead not found.', 404)
  return data as AiLead
}

const OWNER_STATUSES: AiLeadStatus[] = ['new', 'replied', 'not_relevant']

/** Replied, not relevant, or back to new (an undo). "Converted" only comes from creating a request. */
export async function setAiLeadStatus(staff: Staff, id: string, status: unknown) {
  if (!OWNER_STATUSES.includes(status as AiLeadStatus)) throw new AppError('Status must be new, replied or not_relevant.', 400)
  const lead = await getLead(id)
  if (lead.status === 'converted') throw new AppError('This lead is already a request.', 409)
  const { error } = await getServiceClient()
    .from('ai_leads')
    .update(
      status === 'new'
        ? { status, handled_by: null, handled_at: null }
        : { status, handled_by: staff.id, handled_at: new Date().toISOString() }
    )
    .eq('id', id)
  if (error) throw new AppError(`Could not save: ${error.message}`, 500)
  await logOwner(staff, `lead.${status}`, { lead_id: id, url: lead.url })
}

function clean(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const t = value.trim().replace(/\s+/g, ' ')
  return t ? t.slice(0, max) : null
}

function leadNotes(lead: AiLead): string {
  const d = lead.details || {}
  const parts = [`Found by the Lead Scout on ${lead.source_detail || lead.source}: ${lead.url}`]
  if (lead.summary) parts.push(lead.summary)
  if (d.dates) parts.push(`Timing: ${d.dates}`)
  if (d.party) parts.push(`Party: ${d.party}`)
  if (d.places?.length) parts.push(`Places: ${d.places.join(', ')}`)
  if (d.interests) parts.push(`Interests: ${d.interests}`)
  if (d.budget) parts.push(`Budget hints: ${d.budget}`)
  parts.push(`Their post: ${lead.title}${lead.excerpt ? `\n${lead.excerpt.slice(0, 1200)}` : ''}`)
  return parts.join('\n')
}

/** Makes a Client Request from a lead, once the owner is talking to them. */
export async function convertAiLead(staff: Staff, id: string, body: { name?: unknown; email?: unknown; whatsapp?: unknown }) {
  const lead = await getLead(id)
  if (lead.status === 'converted') throw new AppError(`This lead is already ${lead.request_id || 'a request'}.`, 409)
  const name = clean(body.name, 120) || lead.author || 'Lead Scout lead'
  const email = clean(body.email, 200)
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AppError('That email address does not look right.', 400)
  const whatsapp = clean(body.whatsapp, 40)
  const adults = Number(lead.details?.party?.match(/(\d+)\s*adults?/i)?.[1]) || null
  const requestId = await createWebsiteRequest(
    mapWebsiteLead({ source: 'Lead Scout', name, email, whatsapp, numberOfAdults: adults, message: leadNotes(lead) }),
    lead.source_detail || lead.source
  )
  const { error } = await getServiceClient()
    .from('ai_leads')
    .update({ status: 'converted', request_id: requestId, handled_by: staff.id, handled_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new AppError(`Request ${requestId} was created, but the lead could not be updated: ${error.message}`, 500)
  await logOwner(staff, 'lead.converted', { lead_id: id, url: lead.url }, { request_id: requestId })
  return requestId
}

export type AiEmail = {
  id: string
  agent_key: string
  action_type: string
  request_id: string | null
  summary: string
  reasoning: string | null
  to: string | null
  subject: string
  body: string
  /** The owner changed the AI's draft before approving it. */
  edited: boolean
  state: 'waiting' | 'sending' | 'sent' | 'rejected' | 'failed' | 'withdrawn'
  /** Who approved or rejected it: the AI Manager or the owner. */
  decided_by: 'manager' | 'owner' | null
  decision_note: string | null
  error: string | null
  created_at: string
  executed_at: string | null
}

const EMAIL_STATE: Record<string, AiEmail['state']> = {
  proposed: 'waiting',
  approved: 'waiting',
  executing: 'sending',
  executed: 'sent',
  rejected: 'rejected',
  failed: 'failed',
  cancelled: 'withdrawn',
}

type Approval = { action_id: string; decided_by_kind: 'manager' | 'owner'; decision: string; note: string | null; edited_payload: { text?: unknown } | null; created_at: string }

/** Every email an agent wrote (follow-ups now, win-backs, reviews and partner emails later), in full. */
export async function listAiEmails(): Promise<AiEmail[]> {
  const db = getServiceClient()
  const { data, error } = await db
    .from('ai_actions')
    .select('id, agent_key, action_type, status, request_id, summary, reasoning, payload, error, created_at, executed_at')
    .eq('payload->>channel', 'email')
    .order('created_at', { ascending: false })
    .limit(80)
  if (error) throw new AppError(`Could not load emails: ${error.message}`, 500)
  const rows = data || []
  const byAction = new Map<string, Approval[]>()
  if (rows.length) {
    const { data: approvals, error: apErr } = await db
      .from('ai_approvals')
      .select('action_id, decided_by_kind, decision, note, edited_payload, created_at')
      .in('action_id', rows.map((r) => r.id))
      .order('created_at', { ascending: true })
    if (apErr) throw new AppError(`Could not load approvals: ${apErr.message}`, 500)
    for (const a of (approvals || []) as Approval[]) byAction.set(a.action_id, [...(byAction.get(a.action_id) || []), a])
  }
  return rows.map((r) => {
    const p = (r.payload || {}) as Record<string, unknown>
    const decisions = byAction.get(r.id) || []
    const last = decisions[decisions.length - 1]
    // The owner may have edited the draft when approving; the latest edit is what went out.
    const edit = [...decisions].reverse().find((d) => d.decided_by_kind === 'owner' && d.decision === 'approve' && typeof d.edited_payload?.text === 'string')
    const drafted = String(p.body ?? p.text ?? '')
    const body = edit ? String(edit.edited_payload?.text) : drafted
    return {
      id: r.id,
      agent_key: r.agent_key,
      action_type: r.action_type,
      request_id: r.request_id,
      summary: r.summary,
      reasoning: r.reasoning,
      to: typeof p.to === 'string' ? p.to : null,
      subject: String(p.subject || ''),
      body,
      edited: !!edit && body.trim() !== drafted.trim(),
      state: EMAIL_STATE[r.status] || 'waiting',
      decided_by: last ? last.decided_by_kind : null,
      decision_note: last?.note ?? null,
      error: r.error,
      created_at: r.created_at,
      executed_at: r.executed_at,
    }
  })
}
