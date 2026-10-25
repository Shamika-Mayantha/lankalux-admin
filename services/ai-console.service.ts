import { AppError, getServiceClient } from '@/services/supabase.server'
import type { Staff } from '@/services/staff.service'

/**
 * Owner controls for the AI agent system (ai_* tables). Server-only: every caller is a
 * supervisor route. Approvals recorded here are checked again by ai_begin_action() in
 * the database before anything runs, so this file cannot widen what agents may do.
 */

export type AiSettings = {
  system_paused: boolean
  customer_messaging_enabled: boolean
  owner_approves_messages: boolean
  max_task_depth: number
  max_tasks_per_request_per_hour: number
  updated_at: string
}

export type AiAgent = {
  key: string
  name: string
  description: string
  paused: boolean
  model: string | null
  last_heartbeat_at: string | null
  last_error: string | null
}

export type AiPendingAction = {
  id: string
  agent_key: string
  action_type: string
  level: number
  request_id: string | null
  conversation_id: string | null
  summary: string
  reasoning: string | null
  payload: Record<string, unknown>
  created_at: string
}

export type AiActivity = {
  id: number
  actor_kind: string
  agent_key: string | null
  request_id: string | null
  event: string
  detail: Record<string, unknown>
  created_at: string
}

export type AiMessage = {
  direction: 'inbound' | 'outbound'
  sender_kind: string
  body: string
  status: string
  created_at: string
}

export type AiConversation = {
  id: string
  channel: string
  external_id: string
  customer_name: string | null
  mode: 'ai' | 'human' | 'closed'
  request_id: string | null
  last_message_at: string | null
  service_window_expires_at: string | null
  /** Trip details the Website Concierge collected (website chats only). */
  lead: Record<string, unknown> | null
  messages: AiMessage[]
}

export type AiRunningTask = {
  id: string
  agent_key: string
  task_type: string
  request_id: string | null
  updated_at: string
}

export type AiPing = {
  id: string
  kind: 'approval_needed' | 'attention' | 'error' | 'summary' | 'info'
  title: string
  body: string
  request_id: string | null
  action_id: string | null
  created_at: string
}

/** Notifications that ask for the owner (the rest are shown in the activity feed only). */
const PING_KINDS = ['approval_needed', 'attention', 'error']

export type AiOverview = {
  settings: AiSettings
  /** Unread notes from the agents that need the owner (Manager escalations, trip gaps, errors). */
  pings: AiPing[]
  /** Tasks an agent is working on right now (shown live on the AI page). */
  running: AiRunningTask[]
  agents: AiAgent[]
  pending: AiPendingAction[]
  activity: AiActivity[]
  conversations: AiConversation[]
  /** Chats with the Website Concierge on lankalux.com. */
  websiteChats: AiConversation[]
  counts: { queued: number; running: number; failed_today: number; executed_today: number }
  summary: { day: string; summary: string } | null
}

function fail(error: { message: string } | null, what: string) {
  if (error) throw new AppError(`Could not load ${what}: ${error.message}`, 500)
}

function todayStart() {
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  return d.toISOString()
}

export async function getAiOverview(): Promise<AiOverview> {
  const db = getServiceClient()
  const since = todayStart()
  const [settings, agents, pending, activity, queued, running, failed, executed, summary, conversations, runningTasks, pings] = await Promise.all([
    db.from('ai_settings').select('system_paused, customer_messaging_enabled, owner_approves_messages, max_task_depth, max_tasks_per_request_per_hour, updated_at').maybeSingle(),
    db.from('ai_agents').select('key, name, description, paused, model, last_heartbeat_at, last_error').order('key'),
    db
      .from('ai_actions')
      .select('id, agent_key, action_type, level, request_id, conversation_id, summary, reasoning, payload, created_at')
      .eq('status', 'proposed')
      // Level 2/3 work, plus every customer message (the owner approves those while testing).
      .or('level.gte.2,action_type.like.message.*')
      .order('created_at', { ascending: true })
      .limit(50),
    db.from('ai_activity_log').select('id, actor_kind, agent_key, request_id, event, detail, created_at').order('created_at', { ascending: false }).limit(40),
    db.from('ai_tasks').select('id', { count: 'exact', head: true }).eq('status', 'queued'),
    db.from('ai_tasks').select('id', { count: 'exact', head: true }).eq('status', 'running'),
    db.from('ai_tasks').select('id', { count: 'exact', head: true }).eq('status', 'failed').gte('finished_at', since),
    db.from('ai_actions').select('id', { count: 'exact', head: true }).eq('status', 'executed').gte('executed_at', since),
    db.from('ai_daily_summaries').select('day, summary').order('day', { ascending: false }).limit(1).maybeSingle(),
    db
      .from('ai_conversations')
      .select('id, channel, external_id, customer_name, mode, request_id, last_message_at, service_window_expires_at, lead')
      .neq('channel', 'owner')
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(50),
    db.from('ai_tasks').select('id, agent_key, task_type, request_id, updated_at').eq('status', 'running').order('updated_at', { ascending: false }).limit(20),
    db
      .from('ai_notifications')
      .select('id, kind, title, body, request_id, action_id, created_at')
      .is('read_at', null)
      .in('kind', PING_KINDS)
      .order('created_at', { ascending: false })
      .limit(20),
  ])
  fail(settings.error, 'AI settings')
  fail(agents.error, 'AI agents')
  fail(pending.error, 'approvals')
  fail(activity.error, 'AI activity')
  fail(conversations.error, 'conversations')
  fail(runningTasks.error, 'running tasks')
  fail(pings.error, 'notifications')
  if (!settings.data) throw new AppError('The AI system is not installed in the database yet.', 503)
  // Website chats are many and short, so they get their own list instead of crowding out WhatsApp.
  const allConvs = (conversations.data || []) as Omit<AiConversation, 'messages'>[]
  const convRows = [
    ...allConvs.filter((c) => c.channel !== 'website').slice(0, 20),
    ...allConvs.filter((c) => c.channel === 'website').slice(0, 30),
  ]
  const byConv = new Map<string, AiMessage[]>()
  if (convRows.length) {
    const { data: msgs, error: msgErr } = await db
      .from('ai_messages')
      .select('conversation_id, direction, sender_kind, body, status, created_at')
      .in('conversation_id', convRows.map((c) => c.id))
      .order('created_at', { ascending: false })
      .limit(600)
    fail(msgErr, 'messages')
    for (const m of (msgs || []) as (AiMessage & { conversation_id: string })[]) {
      const list = byConv.get(m.conversation_id) || []
      // Keep the latest 12 per conversation, shown oldest first.
      if (list.length < 12) list.unshift({ direction: m.direction, sender_kind: m.sender_kind, body: m.body, status: m.status, created_at: m.created_at })
      byConv.set(m.conversation_id, list)
    }
  }
  const cfg = settings.data as AiSettings
  const pingRows = (pings.data || []) as AiPing[]
  // While the AI Manager approves messages, the owner only sees what needs them: Level 3 work and
  // anything the Manager or the Quality check flagged. The rest is the Manager's to decide.
  const flagged = new Set(pingRows.filter((p) => p.kind === 'approval_needed' && p.action_id).map((p) => p.action_id))
  const pendingRows = ((pending.data || []) as AiPendingAction[]).filter(
    (a) => cfg.owner_approves_messages || a.level >= 3 || flagged.has(a.id)
  )
  return {
    settings: cfg,
    pings: pingRows,
    running: (runningTasks.data || []) as AiRunningTask[],
    agents: (agents.data || []) as AiAgent[],
    pending: pendingRows,
    activity: (activity.data || []) as AiActivity[],
    conversations: convRows.filter((c) => c.channel !== 'website').map((c) => ({ ...c, messages: byConv.get(c.id) || [] })),
    websiteChats: convRows.filter((c) => c.channel === 'website').map((c) => ({ ...c, messages: byConv.get(c.id) || [] })),
    counts: {
      queued: queued.count || 0,
      running: running.count || 0,
      failed_today: failed.count || 0,
      executed_today: executed.count || 0,
    },
    summary: (summary.data as AiOverview['summary']) || null,
  }
}

export async function logOwner(staff: Staff, event: string, detail: Record<string, unknown>, extra: { action_id?: string; request_id?: string | null } = {}) {
  const { error } = await getServiceClient()
    .from('ai_activity_log')
    .insert({ actor_kind: 'owner', actor_user: staff.id, event, detail, action_id: extra.action_id, request_id: extra.request_id ?? null })
  if (error) console.error('[ai-console] activity log failed', error.message)
}

/**
 * Asks the whatsapp-send Edge Function to deliver approved replies. It re-checks every
 * message against the database gate, so calling it is always safe; a failure here only
 * means the reply goes out on the next call.
 */
export async function flushApprovedMessages(): Promise<{ sent: number; waiting: number; failed: number; error?: string }> {
  const out = { sent: 0, waiting: 0, failed: 0 }
  try {
    const { data, error } = await getServiceClient().functions.invoke('whatsapp-send', { body: {} })
    if (error) return { ...out, error: error.message }
    for (const r of Object.values((data as { results?: Record<string, string> })?.results || {})) {
      if (r === 'sent') out.sent++
      else if (r === 'waiting') out.waiting++
      else out.failed++
    }
    return out
  } catch (err) {
    return { ...out, error: err instanceof Error ? err.message : 'Sender unavailable' }
  }
}

export type AiSettingsPatch = { system_paused?: unknown; customer_messaging_enabled?: unknown; owner_approves_messages?: unknown }

export async function updateAiSettings(staff: Staff, patch: AiSettingsPatch) {
  const next: Record<string, unknown> = {}
  if (typeof patch.system_paused === 'boolean') next.system_paused = patch.system_paused
  if (typeof patch.customer_messaging_enabled === 'boolean') next.customer_messaging_enabled = patch.customer_messaging_enabled
  if (typeof patch.owner_approves_messages === 'boolean') next.owner_approves_messages = patch.owner_approves_messages
  if (Object.keys(next).length === 0) throw new AppError('Nothing to change.', 400)
  const { error } = await getServiceClient()
    .from('ai_settings')
    .update({ ...next, updated_by: staff.id, updated_at: new Date().toISOString() })
    .eq('id', true)
  if (error) throw new AppError(`Could not save: ${error.message}`, 500)
  await logOwner(staff, 'settings.changed', next)
  // Replies approved while the system was paused or messaging was off (or approved by the
  // Manager while the owner still approved messages) can go now.
  if (next.system_paused === false || next.customer_messaging_enabled === true || next.owner_approves_messages === false) {
    await flushApprovedMessages()
  }
}

/** Marks pings as seen (all of them when no ids are given). */
export async function markPingsRead(staff: Staff, ids: unknown) {
  let q = getServiceClient().from('ai_notifications').update({ read_at: new Date().toISOString() }).is('read_at', null)
  if (Array.isArray(ids)) {
    const list = ids.filter((i): i is string => typeof i === 'string' && /^[0-9a-f-]{36}$/i.test(i)).slice(0, 50)
    if (!list.length) throw new AppError('Nothing to mark.', 400)
    q = q.in('id', list)
  }
  const { error } = await q
  if (error) throw new AppError(`Could not save: ${error.message}`, 500)
}

/** Hands a conversation to a person (the AI stops replying and its unsent drafts are withdrawn) or back to the AI. */
export async function setConversationMode(staff: Staff, id: string, mode: unknown) {
  if (mode !== 'ai' && mode !== 'human') throw new AppError('Mode must be ai or human.', 400)
  const db = getServiceClient()
  const { data, error } = await db
    .from('ai_conversations')
    .update(mode === 'human' ? { mode, taken_over_by: staff.id, taken_over_at: new Date().toISOString() } : { mode, taken_over_by: null, taken_over_at: null })
    .eq('id', id)
    .select('id, request_id')
  if (error) throw new AppError(`Could not save: ${error.message}`, 500)
  if (!data || data.length === 0) throw new AppError('Conversation not found.', 404)
  if (mode === 'human') {
    const { error: cancelErr } = await db
      .from('ai_actions')
      .update({ status: 'cancelled' })
      .eq('conversation_id', id)
      .eq('status', 'proposed')
      .like('action_type', 'message.%')
    if (cancelErr) throw new AppError(`Taken over, but drafts could not be withdrawn: ${cancelErr.message}`, 500)
  }
  await logOwner(staff, mode === 'human' ? 'conversation.taken_over' : 'conversation.handed_back', { conversation_id: id }, { request_id: data[0].request_id })
}

export async function setAgentPaused(staff: Staff, key: string, paused: unknown) {
  if (typeof paused !== 'boolean') throw new AppError('paused must be true or false.', 400)
  const { data, error } = await getServiceClient()
    .from('ai_agents')
    .update({ paused, updated_by: staff.id, updated_at: new Date().toISOString() })
    .eq('key', key)
    .select('key')
  if (error) throw new AppError(`Could not save: ${error.message}`, 500)
  if (!data || data.length === 0) throw new AppError('Unknown agent.', 404)
  await logOwner(staff, paused ? 'agent.paused' : 'agent.resumed', { agent: key })
}

/** Records the owner's decision. Approving does not run anything: the agent service runs it next, through the database gate. */
export async function decideAiAction(staff: Staff, id: string, decision: unknown, note: unknown, text?: unknown) {
  if (decision !== 'approve' && decision !== 'reject') throw new AppError('Decision must be approve or reject.', 400)
  const db = getServiceClient()
  const { data: action, error: readErr } = await db.from('ai_actions').select('id, status, request_id, action_type, payload').eq('id', id).maybeSingle()
  if (readErr) throw new AppError(`Could not load the action: ${readErr.message}`, 500)
  if (!action) throw new AppError('Action not found.', 404)
  if (action.status !== 'proposed') throw new AppError(`This action is already ${action.status}.`, 409)
  const isMessage = String(action.action_type).startsWith('message.')
  let edited: { text: string } | null = null
  if (decision === 'approve' && isMessage && typeof text === 'string') {
    const t = text.trim()
    if (!t) throw new AppError('The message is empty.', 400)
    if (t.length > 4000) throw new AppError('The message is too long.', 400)
    const p = action.payload as { text?: unknown; body?: unknown }
    if (t !== String(p?.text ?? p?.body ?? '').trim()) edited = { text: t }
  }

  const { error } = await db.from('ai_approvals').insert({
    action_id: id,
    decided_by_kind: 'owner',
    decided_by: staff.id,
    decision,
    note: typeof note === 'string' && note.trim() ? note.trim().slice(0, 2000) : null,
    edited_payload: edited,
  })
  if (error) throw new AppError(`Could not save the decision: ${error.message}`, 500)
  if (decision === 'reject') {
    const { error: updErr } = await db.from('ai_actions').update({ status: 'rejected' }).eq('id', id).eq('status', 'proposed')
    if (updErr) throw new AppError(`Could not mark it rejected: ${updErr.message}`, 500)
  }
  await logOwner(staff, decision === 'approve' ? 'action.approved' : 'action.rejected', { action_type: action.action_type, edited: !!edited }, { action_id: id, request_id: action.request_id })
  // The owner has dealt with it, so its pings are done too.
  await db.from('ai_notifications').update({ read_at: new Date().toISOString() }).eq('action_id', id).is('read_at', null)
  if (decision === 'approve' && (action.payload as { channel?: unknown } | null)?.channel === 'email') {
    const { runEmailFollowUps } = await import('@/services/ai-dispatch.service')
    return { ...(await runEmailFollowUps()), channel: 'email' as const }
  }
  if (decision === 'approve' && isMessage) return flushApprovedMessages()
  return null
}

export type AiPlaybook = { playbook: string; updated_at: string | null }

const PLAYBOOK_MAX = 20000

/** The owner's playbook: business facts and writing rules the customer-facing agents follow. */
export async function getAiPlaybook(): Promise<AiPlaybook> {
  const { data, error } = await getServiceClient().from('ai_settings').select('playbook, playbook_updated_at').eq('id', true).maybeSingle()
  if (error) throw new AppError(`Could not load the playbook: ${error.message}`, 500)
  return { playbook: (data?.playbook as string) || '', updated_at: (data?.playbook_updated_at as string | null) ?? null }
}

export async function updateAiPlaybook(staff: Staff, playbook: unknown): Promise<AiPlaybook> {
  if (typeof playbook !== 'string') throw new AppError('The playbook must be text.', 400)
  const text = playbook.replace(/\r\n/g, '\n').trim()
  if (text.length > PLAYBOOK_MAX) throw new AppError(`The playbook is too long (${text.length} of ${PLAYBOOK_MAX} characters).`, 400)
  const now = new Date().toISOString()
  const { error } = await getServiceClient()
    .from('ai_settings')
    .update({ playbook: text, playbook_updated_at: now, updated_by: staff.id, updated_at: now })
    .eq('id', true)
  if (error) throw new AppError(`Could not save the playbook: ${error.message}`, 500)
  await logOwner(staff, 'playbook.changed', { characters: text.length })
  return { playbook: text, updated_at: now }
}

const INSTRUCTIONS_MAX = 4000

/** The owner's extra instructions for one agent (today only the Website Concierge reads them live). */
export async function getAgentInstructions(key: string): Promise<{ instructions: string; updated_at: string | null }> {
  const { data, error } = await getServiceClient().from('ai_agents').select('system_prompt, updated_at').eq('key', key).maybeSingle()
  if (error) throw new AppError(`Could not load the agent: ${error.message}`, 500)
  if (!data) throw new AppError('Unknown agent.', 404)
  return { instructions: (data.system_prompt as string) || '', updated_at: (data.updated_at as string | null) ?? null }
}

export async function updateAgentInstructions(staff: Staff, key: string, instructions: unknown) {
  if (typeof instructions !== 'string') throw new AppError('Instructions must be text.', 400)
  const text = instructions.replace(/\r\n/g, '\n').trim()
  if (text.length > INSTRUCTIONS_MAX) throw new AppError(`Too long (${text.length} of ${INSTRUCTIONS_MAX} characters).`, 400)
  const now = new Date().toISOString()
  const { data, error } = await getServiceClient()
    .from('ai_agents')
    .update({ system_prompt: text, updated_by: staff.id, updated_at: now })
    .eq('key', key)
    .select('key')
  if (error) throw new AppError(`Could not save: ${error.message}`, 500)
  if (!data || data.length === 0) throw new AppError('Unknown agent.', 404)
  await logOwner(staff, 'agent.instructions_changed', { agent: key, characters: text.length })
  return { instructions: text, updated_at: now }
}
