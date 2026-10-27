/** Plain-English labels for the agent system's task types and activity events (AI page and Headquarters). */

export const TASK_LABEL: Record<string, string> = {
  qualify_lead: 'qualifying a new lead',
  handle_inquiry: 'drafting a WhatsApp reply',
  daily_summary: 'writing the daily summary',
  scan_follow_ups: 'checking for quiet leads',
  check_upcoming_trips: 'checking upcoming trips',
  generate_itinerary: 'drafting an itinerary',
  review_action: 'reviewing a proposed action',
  price_guide: 'working out a price guide',
  status_changed: 'checking a status change',
  scan_for_leads: 'searching for new leads',
  judge_lead: 'reading a lead',
  scan_win_backs: 'looking for past enquiries to win back',
  draft_win_back: 'writing a win-back email',
  plan_partners: 'planning partner emails',
  route_event: 'routing a new event',
  review_itinerary: 'checking an itinerary',
  research_partner: 'reading a partner website',
}

/** Verb phrases; the actor's name goes in front ("Sales finished qualifying a new lead"). */
export const EVENT_LABEL: Record<string, string> = {
  'task.succeeded': 'finished',
  'task.failed': 'failed',
  'task.retry': 'will retry',
  'task.waiting': 'is waiting on',
  'action.begin': 'started an approved action',
  'action.executed': 'completed an action',
  'action.failed': 'could not complete an action',
  'action.approved': 'approved an action',
  'action.rejected': 'rejected an action',
  'settings.changed': 'changed the AI settings',
  'playbook.changed': 'updated the playbook',
  'testdrive.report': 'ran a test drive (nothing was sent)',
  'agent.paused': 'paused an agent',
  'agent.resumed': 'resumed an agent',
  'conversation.taken_over': 'took over a conversation',
  'conversation.handed_back': 'handed a conversation back to the AI',
  'task.rate_limit': 'hit the hourly limit for a request',
  'task.depth_limit': 'stopped a chain of tasks at the depth limit',
  'website.request_created': 'passed a website chat to the team as a new request',
  'agent.instructions_changed': "changed an agent's instructions",
  'lead.replied': 'replied to a lead',
  'lead.not_relevant': 'set a lead aside',
  'lead.new': 'moved a lead back to new',
  'lead.converted': 'made a request from a lead',
}

export function capitalise(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export function readable(type: string) {
  return type.replace(/[._]/g, ' ')
}

export function taskLabel(type: unknown) {
  const t = String(type || '')
  return TASK_LABEL[t] || readable(t)
}
