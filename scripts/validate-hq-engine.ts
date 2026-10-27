/**
 * Checks the AI Headquarters engine against a day shaped like the real agent tables:
 * a WhatsApp enquiry routed by the Manager to Sales, Sales asking Planner and Pricing,
 * a reply checked by Quality and approved by the Manager, a scheduled scan, a failure,
 * a website chat and an action waiting for the owner. Run with `npm run test:hq`.
 */
import assert from 'node:assert/strict'
import {
  agentStatesAt,
  buildTimeline,
  emptyStore,
  eventsBetween,
  GATEWAY,
  mergeSnapshot,
  nextActivityAfter,
  nextSince,
  OWNER,
  type StateOptions,
} from '../features/hq/engine'
import type { HqSnapshot, HqTask } from '../services/ai-hq.service'

const T0 = Date.parse('2026-10-27T09:00:00Z')
const iso = (offsetSec: number) => new Date(T0 + offsetSec * 1000).toISOString()
const NOW = T0 + 3600_000

const agent = (key: string, name: string, extra: Partial<HqSnapshot['agents'][number]> = {}) => ({
  key,
  name,
  description: '',
  paused: false,
  model: 'qwen3:8b',
  last_heartbeat_at: new Date(NOW - 20_000).toISOString(),
  last_error: null,
  ...extra,
})

const task = (id: string, agent_key: string, task_type: string, created: number, finished: number | null, extra: Partial<HqTask> = {}): HqTask => ({
  id,
  agent_key,
  task_type,
  status: finished === null ? 'running' : 'succeeded',
  request_id: 'req-1',
  conversation_id: null,
  parent_task_id: null,
  created_by: 'system',
  error: null,
  attempts: 1,
  created_at: iso(created),
  updated_at: iso(finished ?? created + 5),
  finished_at: finished === null ? null : iso(finished),
  ...extra,
})

let logId = 0
const log = (event: string, agent_key: string | null, at: number, extra: Record<string, unknown> = {}) => ({
  id: ++logId,
  actor_kind: 'agent' as const,
  agent_key,
  task_id: null as string | null,
  action_id: null as string | null,
  request_id: 'req-1',
  event,
  detail: {} as Record<string, unknown>,
  created_at: iso(at),
  ...extra,
})

const snapshot: HqSnapshot = {
  server_now: new Date(NOW).toISOString(),
  full: true,
  window_hours: 24,
  settings: { system_paused: false, customer_messaging_enabled: true, owner_approves_messages: false },
  agents: [
    agent('manager', 'AI General Manager'),
    agent('sales', 'Sales Agent'),
    agent('planner', 'Travel Planner'),
    agent('pricing', 'Pricing Agent'),
    agent('quality', 'Quality Agent'),
    agent('followup', 'Follow-up Agent'),
    agent('operations', 'Operations Agent', { last_heartbeat_at: new Date(NOW - 10 * 60_000).toISOString() }),
    agent('winback', 'Win-back', { paused: true }),
    agent('concierge', 'Website Concierge', { last_heartbeat_at: '2026-10-19T15:35:26Z' }),
  ],
  tasks: [
    task('t-route', 'manager', 'route_event', 0, 10, { created_by: 'events' }),
    task('t-qual', 'sales', 'qualify_lead', 10, 200, { parent_task_id: 't-route', created_by: 'manager' }),
    task('t-price', 'pricing', 'price_guide', 200, 400, { parent_task_id: 't-qual', created_by: 'sales' }),
    task('t-plan', 'planner', 'generate_itinerary', 200, 600, { parent_task_id: 't-qual', created_by: 'sales' }),
    task('t-reply', 'sales', 'handle_inquiry', 600, 900, { parent_task_id: 't-route', created_by: 'manager' }),
    task('t-qa', 'quality', 'review_action', 900, 910, { parent_task_id: 't-reply', created_by: 'sales' }),
    task('t-mgr', 'manager', 'review_action', 910, 1100, { parent_task_id: 't-qa', created_by: 'quality' }),
    task('t-scan', 'followup', 'scan_follow_ups', 1800, 1801),
    task('t-bad', 'pricing', 'price_guide', 2000, 2100, { status: 'failed', error: 'Ollama request failed: timeout' }),
    // Running right now: started (claimed) 2 minutes ago and is in a model call.
    task('t-now', 'planner', 'generate_itinerary', 3400, null, { updated_at: new Date(NOW - 120_000).toISOString() }),
  ],
  activity: [
    log('task.succeeded', 'manager', 10, { task_id: 't-route', detail: { seconds: 2, task_type: 'route_event' } }),
    log('llm.start', 'sales', 20, { task_id: 't-qual' }),
    log('llm.end', 'sales', 190, { task_id: 't-qual' }),
    log('task.succeeded', 'sales', 200, { task_id: 't-qual', detail: { seconds: 185, task_type: 'qualify_lead' } }),
    log('task.succeeded', 'pricing', 400, { task_id: 't-price', detail: { seconds: 150 } }),
    log('task.succeeded', 'planner', 600, { task_id: 't-plan', detail: { seconds: 380 } }),
    log('task.succeeded', 'sales', 900, { task_id: 't-reply', detail: { seconds: 240 } }),
    log('task.succeeded', 'quality', 910, { task_id: 't-qa', detail: { seconds: 0.4 } }),
    log('task.succeeded', 'manager', 1100, { task_id: 't-mgr', detail: { seconds: 180 } }),
    log('action.executed', null, 1110, { action_id: 'a-reply' }),
    log('task.succeeded', 'followup', 1801, { task_id: 't-scan', detail: { seconds: 0.6 } }),
    log('task.retry', 'pricing', 2050, { task_id: 't-bad', detail: { error: 'Ollama request failed: timeout' } }),
    log('task.failed', 'pricing', 2100, { task_id: 't-bad', detail: { seconds: 50 } }),
    log('llm.start', 'planner', 3500, { task_id: 't-now' }),
  ],
  actions: [
    {
      id: 'a-reply', task_id: 't-reply', agent_key: 'sales', action_type: 'message.collect_info', level: 2, status: 'executed',
      request_id: 'req-1', conversation_id: 'c-1', summary: 'Ask Emma for travel dates', reasoning: null, payload: {}, error: null,
      created_at: iso(900), updated_at: iso(1110), executed_at: iso(1110), needs_owner: false,
    },
    {
      id: 'a-wait', task_id: null, agent_key: 'followup', action_type: 'message.follow_up', level: 2, status: 'proposed',
      request_id: 'req-2', conversation_id: null, summary: 'Follow up with James', reasoning: null, payload: {}, error: null,
      created_at: iso(2500), updated_at: iso(2500), executed_at: null, needs_owner: true,
    },
  ],
  approvals: [{ id: 'ap-1', action_id: 'a-reply', decided_by_kind: 'manager', decision: 'approve', note: null, created_at: iso(1100) }],
  messages: [
    { id: 'm-1', conversation_id: 'c-1', channel: 'whatsapp', customer_name: 'Emma', direction: 'inbound', sender_kind: 'customer', agent_key: null, action_id: null, body: 'Hi, we want to visit in March', status: 'received', created_at: iso(-2) },
    { id: 'w-1', conversation_id: 'c-w', channel: 'website', customer_name: null, direction: 'inbound', sender_kind: 'customer', agent_key: null, action_id: null, body: 'Do you do honeymoons?', status: 'received', created_at: iso(3000) },
    { id: 'w-2', conversation_id: 'c-w', channel: 'website', customer_name: null, direction: 'outbound', sender_kind: 'ai', agent_key: 'concierge', action_id: null, body: 'We do!', status: 'sent', created_at: iso(3008) },
  ],
  pings: [],
  bots: [
    {
      key: 'instagram_check', name: 'Instagram check', schedule: 'Mondays', does: '',
      runs: [{ id: 'r-1', bot: 'instagram_check', status: 'succeeded', summary: 'Sent 3 changes', links: [], started_at: iso(1200), finished_at: iso(1290) }],
    },
  ],
  summary: null,
}

const store = mergeSnapshot(emptyStore(), snapshot, NOW)
const tl = buildTimeline(store)
const live: StateOptions = { live: true, now: NOW, scale: 1 }
const replay = (scale = 60): StateOptions => ({ live: false, now: NOW, scale })

// --- Timeline: every hand-off is a real parent/child pair -------------------
const kinds = (id: string) => tl.events.find((e) => e.id === id)
assert.equal(kinds('inbound:t-route')?.actor, GATEWAY, 'CRM/WhatsApp event reaches the Manager')
assert.equal(kinds('inbound:t-route')?.to, 'manager')
assert.deepEqual([kinds('delegate:t-qual')?.actor, kinds('delegate:t-qual')?.to], ['manager', 'sales'])
assert.deepEqual([kinds('delegate:t-plan')?.actor, kinds('delegate:t-plan')?.to], ['sales', 'planner'])
assert.deepEqual([kinds('finish:t-plan')?.kind, kinds('finish:t-plan')?.to], ['report', 'sales'], 'Planner reports back to Sales')
assert.equal(kinds('finish:t-scan')?.to, undefined, 'a scheduled scan reports to no one')
assert.equal(kinds('delegate:t-scan'), undefined, 'scheduled work is not a hand-off')
assert.deepEqual([kinds('decision:ap-1')?.actor, kinds('decision:ap-1')?.to], ['manager', 'sales'], 'Manager approval travels to Sales')
assert.equal(tl.events.find((e) => e.action_id === 'a-reply' && e.kind === 'outbound')?.to, GATEWAY, 'sent message goes out to the customer')
assert.deepEqual([kinds('propose:a-wait')?.kind, kinds('propose:a-wait')?.to], ['ask_owner', OWNER])
assert.equal(kinds('fail:t-bad')?.tone, 'bad')
assert.ok(tl.events.some((e) => e.id === 'msg:w-1' && e.to === 'concierge'), 'website visitor reaches the concierge')
assert.ok(tl.events.some((e) => e.id === 'botrun:r-1'), 'Claude bot run is on the timeline')
assert.ok(tl.events.every((e, i) => i === 0 || tl.events[i - 1].t <= e.t), 'events are in time order')

// Spans use the worker's own timings.
const qual = tl.spans.find((s) => s.id === 'work:t-qual')!
assert.equal(qual.end! - qual.start, 185_000, 'task span = logged seconds')
const think = tl.spans.find((s) => s.node === 'sales' && s.kind === 'think')!
assert.equal(think.end! - think.start, 170_000, 'think span from llm.start to llm.end')
assert.equal(tl.spans.find((s) => s.id === 'work:t-now')?.end, null, 'running task has no end yet')

// --- States in Replay --------------------------------------------------------
const at = (sec: number, opts = replay()) => agentStatesAt(store, tl, T0 + sec * 1000, opts)
assert.equal(at(100).get('sales')?.state, 'thinking', 'Sales is in a model call at 100s')
assert.equal(at(195).get('sales')?.state, 'working', 'after the call, still on the task')
assert.equal(at(300).get('planner')?.state, 'working')
assert.equal(at(300).get('followup')?.state, 'idle')
assert.equal(at(601, replay(1)).get('planner')?.state, 'communicating', 'just reported back')
assert.equal(at(605, replay(1)).get('planner')?.state, 'completed', 'then cheers briefly')
assert.equal(at(700, replay(1)).get('planner')?.state, 'idle', 'then idles')
assert.equal(at(2800).get('followup')?.state, 'waiting', 'proposal waits for the owner')
assert.equal(at(2400).get('followup')?.state, 'idle', 'not before it was proposed')
assert.equal(at(2200, replay(1)).get('pricing')?.state, 'error', 'failure shows as a problem')
assert.equal(at(3004).get('concierge')?.state, 'working', 'concierge answers the website visitor')
assert.equal(at(1250).get('bot:instagram_check')?.state, 'working', 'Claude bot run')
// Replay ignores the live-only facts: paused Win-back and stale heartbeats.
assert.equal(at(300).get('winback')?.state, 'idle')
assert.equal(at(300).get('operations')?.state, 'idle')

// --- States live -------------------------------------------------------------
const now = agentStatesAt(store, tl, NOW - 6000, live)
assert.equal(now.get('winback')?.state, 'paused')
assert.equal(now.get('operations')?.state, 'offline', 'no heartbeat for 10 minutes')
assert.equal(now.get('concierge')?.state, 'idle', 'concierge runs inside admin and has no heartbeat')
assert.equal(now.get('planner')?.state, 'thinking')
assert.equal(now.get('planner')?.span?.id, 'work:t-now', 'thinking shows the task it belongs to')
assert.equal(now.get('followup')?.state, 'waiting')
assert.equal(now.get('followup')?.waiting.length, 1)
const paused = mergeSnapshot(store, { ...snapshot, full: false, settings: { ...snapshot.settings, system_paused: true }, tasks: [], activity: [], actions: [], approvals: [], messages: [] }, NOW)
assert.equal(agentStatesAt(paused, buildTimeline(paused), NOW, live).get('sales')?.state, 'paused', 'pausing the system pauses every agent')
assert.equal(agentStatesAt(paused, buildTimeline(paused), NOW, live).get('concierge')?.state, 'idle', 'except the concierge, which pauses on its own')

// --- Merging and cursors -------------------------------------------------------
assert.equal(paused.tasks.size, store.tasks.size, 'partial snapshot keeps earlier rows')
const finished = mergeSnapshot(store, { ...snapshot, full: false, tasks: [{ ...store.tasks.get('t-now')!, status: 'succeeded', finished_at: iso(3700), updated_at: iso(3700) }], activity: [], actions: [], approvals: [], messages: [] }, NOW)
assert.equal(finished.tasks.get('t-now')?.status, 'succeeded', 'rows update in place')
assert.equal(nextSince(store), new Date(NOW - 15_000).toISOString())

// --- Replay helpers --------------------------------------------------------------
assert.deepEqual(eventsBetween(tl, T0 + 590_000, T0 + 601_000).map((e) => e.id).sort(), ['delegate:t-reply', 'finish:t-plan'])
assert.equal(nextActivityAfter(tl, T0 + 1801_000), T0 + 2050_000, 'skips to the next thing: the failed task started 50s before it failed')

console.log(`hq engine: ${tl.events.length} events, ${tl.spans.length} spans, all checks passed`)
