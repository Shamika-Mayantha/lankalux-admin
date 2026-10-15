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

export type AiOverview = {
  settings: AiSettings
  agents: AiAgent[]
  pending: AiPendingAction[]
  activity: AiActivity[]
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
  const [settings, agents, pending, activity, queued, running, failed, executed, summary] = await Promise.all([
    db.from('ai_settings').select('system_paused, customer_messaging_enabled, max_task_depth, max_tasks_per_request_per_hour, updated_at').maybeSingle(),
    db.from('ai_agents').select('key, name, description, paused, model, last_heartbeat_at, last_error').order('key'),
    db
      .from('ai_actions')
      .select('id, agent_key, action_type, level, request_id, summary, reasoning, payload, created_at')
      .eq('status', 'proposed')
      .gte('level', 2)
      .order('created_at', { ascending: true })
      .limit(50),
    db.from('ai_activity_log').select('id, actor_kind, agent_key, request_id, event, detail, created_at').order('created_at', { ascending: false }).limit(40),
    db.from('ai_tasks').select('id', { count: 'exact', head: true }).eq('status', 'queued'),
    db.from('ai_tasks').select('id', { count: 'exact', head: true }).eq('status', 'running'),
    db.from('ai_tasks').select('id', { count: 'exact', head: true }).eq('status', 'failed').gte('finished_at', since),
    db.from('ai_actions').select('id', { count: 'exact', head: true }).eq('status', 'executed').gte('executed_at', since),
    db.from('ai_daily_summaries').select('day, summary').order('day', { ascending: false }).limit(1).maybeSingle(),
  ])
  fail(settings.error, 'AI settings')
  fail(agents.error, 'AI agents')
  fail(pending.error, 'approvals')
  fail(activity.error, 'AI activity')
  if (!settings.data) throw new AppError('The AI system is not installed in the database yet.', 503)
  return {
    settings: settings.data as AiSettings,
    agents: (agents.data || []) as AiAgent[],
    pending: (pending.data || []) as AiPendingAction[],
    activity: (activity.data || []) as AiActivity[],
    counts: {
      queued: queued.count || 0,
      running: running.count || 0,
      failed_today: failed.count || 0,
      executed_today: executed.count || 0,
    },
    summary: (summary.data as AiOverview['summary']) || null,
  }
}

async function logOwner(staff: Staff, event: string, detail: Record<string, unknown>, extra: { action_id?: string; request_id?: string | null } = {}) {
  const { error } = await getServiceClient()
    .from('ai_activity_log')
    .insert({ actor_kind: 'owner', actor_user: staff.id, event, detail, action_id: extra.action_id, request_id: extra.request_id ?? null })
  if (error) console.error('[ai-console] activity log failed', error.message)
}

export async function updateAiSettings(staff: Staff, patch: { system_paused?: unknown; customer_messaging_enabled?: unknown }) {
  const next: Record<string, unknown> = {}
  if (typeof patch.system_paused === 'boolean') next.system_paused = patch.system_paused
  if (typeof patch.customer_messaging_enabled === 'boolean') next.customer_messaging_enabled = patch.customer_messaging_enabled
  if (Object.keys(next).length === 0) throw new AppError('Nothing to change.', 400)
  const { error } = await getServiceClient()
    .from('ai_settings')
    .update({ ...next, updated_by: staff.id, updated_at: new Date().toISOString() })
    .eq('id', true)
  if (error) throw new AppError(`Could not save: ${error.message}`, 500)
  await logOwner(staff, 'settings.changed', next)
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
export async function decideAiAction(staff: Staff, id: string, decision: unknown, note: unknown) {
  if (decision !== 'approve' && decision !== 'reject') throw new AppError('Decision must be approve or reject.', 400)
  const db = getServiceClient()
  const { data: action, error: readErr } = await db.from('ai_actions').select('id, status, request_id, action_type').eq('id', id).maybeSingle()
  if (readErr) throw new AppError(`Could not load the action: ${readErr.message}`, 500)
  if (!action) throw new AppError('Action not found.', 404)
  if (action.status !== 'proposed') throw new AppError(`This action is already ${action.status}.`, 409)

  const { error } = await db.from('ai_approvals').insert({
    action_id: id,
    decided_by_kind: 'owner',
    decided_by: staff.id,
    decision,
    note: typeof note === 'string' && note.trim() ? note.trim().slice(0, 2000) : null,
  })
  if (error) throw new AppError(`Could not save the decision: ${error.message}`, 500)
  if (decision === 'reject') {
    const { error: updErr } = await db.from('ai_actions').update({ status: 'rejected' }).eq('id', id).eq('status', 'proposed')
    if (updErr) throw new AppError(`Could not mark it rejected: ${updErr.message}`, 500)
  }
  await logOwner(staff, decision === 'approve' ? 'action.approved' : 'action.rejected', { action_type: action.action_type }, { action_id: id, request_id: action.request_id })
}
