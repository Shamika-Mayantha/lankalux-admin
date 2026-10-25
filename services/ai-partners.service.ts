import { AppError, getServiceClient } from '@/services/supabase.server'
import type { Staff } from '@/services/staff.service'
import { logOwner } from '@/services/ai-console.service'

/**
 * Partner outreach: the travel businesses abroad the owner wants introduced to (ai_partners). The owner
 * adds websites here; the Partner agent reads their public pages and drafts an introduction, which goes
 * out only when the owner approves it. Server-only: every caller is a supervisor route.
 */

export type AiPartnerStatus = 'new' | 'researched' | 'not_fit' | 'failed' | 'drafted' | 'emailed' | 'replied'

export type AiPartner = {
  id: string
  website: string
  name: string | null
  country: string | null
  kind: string | null
  contact_email: string | null
  contact_page: string | null
  score: number | null
  summary: string | null
  reason: string | null
  quality_notes: { level: 'hard' | 'soft'; note: string }[]
  status: AiPartnerStatus
  error: string | null
  action_id: string | null
  researched_at: string | null
  created_at: string
}

const COLUMNS =
  'id, website, name, country, kind, contact_email, contact_page, score, summary, reason, quality_notes, status, error, action_id, researched_at, created_at'

const MAX_PER_ADD = 50

/** 'WWW.Agent.co.uk/contact' -> 'https://www.agent.co.uk' (same rule as the agent's sites.origin). */
export function siteOrigin(value: string): string | null {
  let v = value.trim()
  if (!v) return null
  if (!/^https?:\/\//i.test(v)) v = `https://${v}`
  try {
    const u = new URL(v)
    const host = u.hostname.toLowerCase().replace(/\.$/, '')
    if (!['http:', 'https:'].includes(u.protocol) || !host.includes('.') || !/^[a-z0-9.-]+$/.test(host)) return null
    return `${u.protocol}//${host}${u.port ? `:${u.port}` : ''}`
  } catch {
    return null
  }
}

export async function listAiPartners(): Promise<AiPartner[]> {
  const { data, error } = await getServiceClient()
    .from('ai_partners')
    .select(COLUMNS)
    .order('created_at', { ascending: false })
    .limit(300)
  if (error) throw new AppError(`Could not load partners: ${error.message}`, 500)
  return (data || []) as AiPartner[]
}

/** Websites pasted one per line (or separated by spaces/commas). Already-listed sites are skipped. */
export async function addAiPartners(staff: Staff, text: unknown) {
  if (typeof text !== 'string' || !text.trim()) throw new AppError('Paste at least one website.', 400)
  const parts = text.split(/[\s,;]+/).filter(Boolean)
  const sites = [...new Set(parts.map(siteOrigin).filter((s): s is string => !!s))]
  const invalid = parts.length - parts.map(siteOrigin).filter(Boolean).length
  if (!sites.length) throw new AppError('None of those look like website addresses.', 400)
  if (sites.length > MAX_PER_ADD) throw new AppError(`Add at most ${MAX_PER_ADD} websites at a time.`, 400)
  const { data, error } = await getServiceClient()
    .from('ai_partners')
    .upsert(sites.map((website) => ({ website, added_by: staff.id })), { onConflict: 'website', ignoreDuplicates: true })
    .select('id')
  if (error) throw new AppError(`Could not add them: ${error.message}`, 500)
  const added = (data || []).length
  await logOwner(staff, 'partners.added', { added, sites: sites.slice(0, 20) })
  return { added, already: sites.length - added, invalid }
}

const OWNER_STATUSES: AiPartnerStatus[] = ['replied', 'not_fit', 'new']

/** Replied, not a fit, or back to new (the agent reads the site again). */
export async function setAiPartnerStatus(staff: Staff, id: string, status: unknown) {
  if (!OWNER_STATUSES.includes(status as AiPartnerStatus)) throw new AppError('Status must be replied, not_fit or new.', 400)
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new AppError('Partner not found.', 404)
  const db = getServiceClient()
  const { data: p, error: readErr } = await db.from('ai_partners').select('id, status, website').eq('id', id).maybeSingle()
  if (readErr) throw new AppError(`Could not load it: ${readErr.message}`, 500)
  if (!p) throw new AppError('Partner not found.', 404)
  if (status === 'new' && ['drafted', 'emailed', 'replied'].includes(p.status)) {
    throw new AppError('We already wrote to them, so their site is not read again.', 409)
  }
  const patch = status === 'new' ? { status, error: null, score: null, draft_subject: null, draft_body: null } : { status }
  const { error } = await db.from('ai_partners').update(patch).eq('id', id)
  if (error) throw new AppError(`Could not save: ${error.message}`, 500)
  await logOwner(staff, `partner.${status}`, { partner_id: id, website: p.website })
}

/** Takes a site off the list, unless we already wrote to them (that record stays). */
export async function removeAiPartner(staff: Staff, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new AppError('Partner not found.', 404)
  const { data, error } = await getServiceClient()
    .from('ai_partners')
    .delete()
    .eq('id', id)
    .in('status', ['new', 'researched', 'not_fit', 'failed'])
    .select('website')
  if (error) throw new AppError(`Could not remove it: ${error.message}`, 500)
  if (!data?.length) throw new AppError('Only sites we have not written to can be removed.', 409)
  await logOwner(staff, 'partner.removed', { partner_id: id, website: data[0].website })
}
