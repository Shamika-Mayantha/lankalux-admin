import { getServiceClient, isMissingTableError } from '@/services/supabase.server'
import type { ActivityEvent } from '@/types/domain'

export async function logActivity(event: ActivityEvent): Promise<void> {
  const supabase = getServiceClient()
  const row = {
    request_id: event.request_id,
    actor: event.actor ?? null,
    event_type: event.event_type,
    detail: event.detail ?? {},
  }

  const { error } = await supabase.from('activity_logs').insert(row)
  if (!error) return

  if (!isMissingTableError(error)) {
    console.error('activity_logs insert failed:', error.message)
    return
  }

  const { data } = await supabase
    .from('Client Requests')
    .select('activity_log')
    .eq('id', event.request_id)
    .maybeSingle()

  const existing = Array.isArray((data as { activity_log?: unknown } | null)?.activity_log)
    ? ((data as { activity_log: unknown[] }).activity_log as unknown[])
    : []
  const next = [{ ...row, created_at: new Date().toISOString() }, ...existing].slice(0, 200)
  await supabase.from('Client Requests').update({ activity_log: next, updated_at: new Date().toISOString() }).eq('id', event.request_id)
}

export async function listActivity(requestId: string): Promise<ActivityEvent[]> {
  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from('activity_logs')
    .select('*')
    .eq('request_id', requestId)
    .order('created_at', { ascending: false })
    .limit(200)

  if (!error && data) {
    return data as ActivityEvent[]
  }

  const { data: row } = await supabase
    .from('Client Requests')
    .select('activity_log')
    .eq('id', requestId)
    .maybeSingle()
  const log = (row as { activity_log?: ActivityEvent[] } | null)?.activity_log
  return Array.isArray(log) ? log : []
}
