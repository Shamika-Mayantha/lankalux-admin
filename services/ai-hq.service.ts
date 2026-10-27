import { AppError, getServiceClient } from '@/services/supabase.server'
import { flaggedActionIds, ownerDecides, type AiAgent, type AiPing, type AiSettings } from '@/services/ai-console.service'
import { listClaudeBots, type ClaudeBot } from '@/services/claude-bots.service'

/**
 * Data for the AI Headquarters (the 3D view of the agents). Everything here is read from the
 * agent tables as they are: the page animates real rows and never makes activity up.
 * Server-only: every caller is a supervisor route.
 *
 * The first call returns the last day; later calls pass `since` and get only what changed,
 * which the page merges by id. Agents, settings, pings and Claude bot runs are small and always
 * come whole.
 */

/** How far back the first load (and Replay) reaches. */
export const HQ_WINDOW_HOURS = 24
/** Rows per table per call, so a busy day cannot make the page heavy. */
const LIMIT = 500
/** Chat text is for a glance in the panel; the WhatsApp and Website tabs have the full thread. */
const BODY_MAX = 600

export type HqTask = {
  id: string
  agent_key: string
  task_type: string
  status: 'queued' | 'running' | 'waiting' | 'succeeded' | 'failed' | 'cancelled'
  request_id: string | null
  conversation_id: string | null
  parent_task_id: string | null
  created_by: string
  error: string | null
  attempts: number
  created_at: string
  updated_at: string
  finished_at: string | null
}

export type HqActivity = {
  id: number
  actor_kind: 'agent' | 'owner' | 'staff' | 'system'
  agent_key: string | null
  task_id: string | null
  action_id: string | null
  request_id: string | null
  event: string
  detail: Record<string, unknown>
  created_at: string
}

export type HqAction = {
  id: string
  task_id: string | null
  agent_key: string
  action_type: string
  level: number
  status: 'proposed' | 'approved' | 'rejected' | 'executing' | 'executed' | 'failed' | 'cancelled'
  request_id: string | null
  conversation_id: string | null
  summary: string
  reasoning: string | null
  payload: Record<string, unknown>
  error: string | null
  created_at: string
  updated_at: string
  executed_at: string | null
  /** Waiting for the owner (same rule as the Approvals tab). */
  needs_owner: boolean
}

export type HqApproval = {
  id: string
  action_id: string
  decided_by_kind: 'manager' | 'owner'
  decision: 'approve' | 'reject' | 'revise'
  note: string | null
  created_at: string
}

export type HqMessage = {
  id: string
  conversation_id: string
  channel: string
  customer_name: string | null
  direction: 'inbound' | 'outbound'
  sender_kind: string
  agent_key: string | null
  action_id: string | null
  body: string
  status: string
  created_at: string
}

export type HqSnapshot = {
  /** The server clock when this was read; the page measures "how long ago" against it. */
  server_now: string
  /** True when this is the whole window rather than changes since the last call. */
  full: boolean
  window_hours: number
  settings: Pick<AiSettings, 'system_paused' | 'customer_messaging_enabled' | 'owner_approves_messages'>
  agents: AiAgent[]
  tasks: HqTask[]
  activity: HqActivity[]
  actions: HqAction[]
  approvals: HqApproval[]
  messages: HqMessage[]
  pings: AiPing[]
  bots: ClaudeBot[]
  summary: { day: string; summary: string } | null
}

function fail(error: { message: string } | null, what: string) {
  if (error) throw new AppError(`Could not load ${what}: ${error.message}`, 500)
}

/** Parses the `since` cursor; anything odd (or older than the window) means a full load. */
export function parseSince(raw: string | null, now = Date.now()): string | null {
  if (!raw) return null
  const t = Date.parse(raw)
  if (!Number.isFinite(t)) return null
  if (t < now - HQ_WINDOW_HOURS * 3600_000 || t > now + 60_000) return null
  return new Date(t).toISOString()
}

export async function getHqSnapshot(sinceRaw: string | null): Promise<HqSnapshot> {
  const db = getServiceClient()
  const since = parseSince(sinceRaw)
  const windowStart = new Date(Date.now() - HQ_WINDOW_HOURS * 3600_000).toISOString()
  const from = since || windowStart

  const [settings, agents, tasks, activity, actions, approvals, pings, summary, bots] = await Promise.all([
    db.from('ai_settings').select('system_paused, customer_messaging_enabled, owner_approves_messages').maybeSingle(),
    db.from('ai_agents').select('key, name, description, paused, model, last_heartbeat_at, last_error').order('key'),
    db
      .from('ai_tasks')
      .select('id, agent_key, task_type, status, request_id, conversation_id, parent_task_id, created_by, error, attempts, created_at, updated_at, finished_at')
      .gte('updated_at', from)
      .order('updated_at', { ascending: false })
      .limit(LIMIT),
    db
      .from('ai_activity_log')
      .select('id, actor_kind, agent_key, task_id, action_id, request_id, event, detail, created_at')
      .gte('created_at', from)
      .order('id', { ascending: false })
      .limit(LIMIT),
    db
      .from('ai_actions')
      .select('id, task_id, agent_key, action_type, level, status, request_id, conversation_id, summary, reasoning, payload, error, created_at, updated_at, executed_at')
      // Proposed ones always come back, however old, because they still wait for someone.
      .or(`updated_at.gte."${from}",status.eq.proposed`)
      .order('updated_at', { ascending: false })
      .limit(LIMIT),
    db
      .from('ai_approvals')
      .select('id, action_id, decided_by_kind, decision, note, created_at')
      .gte('created_at', from)
      .order('created_at', { ascending: false })
      .limit(LIMIT),
    db
      .from('ai_notifications')
      .select('id, kind, title, body, request_id, action_id, created_at')
      .is('read_at', null)
      .in('kind', ['approval_needed', 'attention', 'error'])
      .order('created_at', { ascending: false })
      .limit(20),
    db.from('ai_daily_summaries').select('day, summary').order('day', { ascending: false }).limit(1).maybeSingle(),
    listClaudeBots().catch(() => [] as ClaudeBot[]),
  ])
  fail(settings.error, 'AI settings')
  fail(agents.error, 'AI agents')
  fail(tasks.error, 'tasks')
  fail(activity.error, 'activity')
  fail(actions.error, 'actions')
  fail(approvals.error, 'approvals')
  fail(pings.error, 'notifications')
  if (!settings.data) throw new AppError('The AI system is not installed in the database yet.', 503)

  const { data: msgRows, error: msgErr } = await db
    .from('ai_messages')
    .select('id, conversation_id, direction, sender_kind, agent_key, action_id, body, status, created_at, ai_conversations!inner(channel, customer_name)')
    .gte('created_at', from)
    .order('created_at', { ascending: false })
    .limit(LIMIT)
  fail(msgErr, 'messages')

  const cfg = settings.data as HqSnapshot['settings']
  const pingRows = (pings.data || []) as AiPing[]
  const flagged = flaggedActionIds(pingRows)
  const conv = (row: { ai_conversations: unknown }) => {
    const c = row.ai_conversations as { channel?: string; customer_name?: string | null } | { channel?: string; customer_name?: string | null }[] | null
    return (Array.isArray(c) ? c[0] : c) || {}
  }

  return {
    server_now: new Date().toISOString(),
    full: !since,
    window_hours: HQ_WINDOW_HOURS,
    settings: cfg,
    agents: (agents.data || []) as AiAgent[],
    tasks: (tasks.data || []) as HqTask[],
    activity: (activity.data || []) as HqActivity[],
    actions: ((actions.data || []) as Omit<HqAction, 'needs_owner'>[]).map((a) => ({
      ...a,
      needs_owner: a.status === 'proposed' && ownerDecides(a, cfg, flagged),
    })),
    approvals: (approvals.data || []) as HqApproval[],
    messages: (msgRows || []).map((m) => {
      const c = conv(m)
      const body = String(m.body || '')
      return {
        id: m.id,
        conversation_id: m.conversation_id,
        channel: c.channel || 'whatsapp',
        customer_name: c.customer_name ?? null,
        direction: m.direction,
        sender_kind: m.sender_kind,
        agent_key: m.agent_key,
        action_id: m.action_id,
        body: body.length > BODY_MAX ? `${body.slice(0, BODY_MAX)}…` : body,
        status: m.status,
        created_at: m.created_at,
      } as HqMessage
    }),
    pings: pingRows,
    bots,
    summary: (summary.data as HqSnapshot['summary']) || null,
  }
}
