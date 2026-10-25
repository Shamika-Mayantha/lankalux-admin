import { randomBytes } from 'crypto'
import { AppError, getServiceClient } from '@/services/supabase.server'
import type { Staff } from '@/services/staff.service'
import { logOwner } from '@/services/ai-console.service'

/**
 * The do-not-email list (ai_email_optouts). Anyone on it never gets an AI-written email again: the
 * database gate (ai_begin_action) refuses it, and the dispatcher checks again before sending.
 * Marketing emails carry a link with a random token (ai_unsubscribe_tokens), so the link holds no address.
 */

const ADMIN_URL = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || 'https://admin.lankalux.com'

export function normalEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const e = value.trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 254 ? e : null
}

/** wholeDomain: for businesses, anyone at the same company who opted out counts (not for gmail.com and the like). */
export async function isUnsubscribed(email: string | null | undefined, opts: { wholeDomain?: boolean } = {}): Promise<boolean> {
  const e = normalEmail(email)
  if (!e) return false
  const domain = e.split('@')[1]
  const q = getServiceClient().from('ai_email_optouts').select('email').limit(1)
  const { data, error } = opts.wholeDomain && !FREE_MAIL.has(domain) ? await q.like('email', `%@${domain}`) : await q.eq('email', e)
  if (error) throw new AppError(`Could not check the unsubscribe list: ${error.message}`, 500)
  return (data || []).length > 0
}

const FREE_MAIL = new Set(['gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com', 'yahoo.com', 'icloud.com', 'me.com', 'aol.com', 'proton.me', 'protonmail.com', 'gmx.com', 'gmx.de', 'web.de'])

/** A fresh link for one email. */
export async function unsubscribeUrlFor(email: string, actionId: string | null): Promise<string> {
  const e = normalEmail(email)
  if (!e) throw new AppError('No valid address for the unsubscribe link.', 400)
  const token = randomBytes(24).toString('hex')
  const { error } = await getServiceClient().from('ai_unsubscribe_tokens').insert({ token, email: e, action_id: actionId })
  if (error) throw new AppError(`Could not make the unsubscribe link: ${error.message}`, 500)
  return `${ADMIN_URL}/unsubscribe?t=${token}`
}

function validToken(token: unknown): token is string {
  return typeof token === 'string' && /^[0-9a-f]{48}$/.test(token)
}

/** "a***@example.com", so the page confirms which address without showing it to anyone who has the link. */
function masked(email: string) {
  const [user, domain] = email.split('@')
  return `${user.slice(0, 1)}***@${domain}`
}

export async function lookUpUnsubscribe(token: unknown): Promise<{ email: string; done: boolean } | null> {
  if (!validToken(token)) return null
  const db = getServiceClient()
  const { data } = await db.from('ai_unsubscribe_tokens').select('email').eq('token', token).maybeSingle()
  if (!data) return null
  const { data: out } = await db.from('ai_email_optouts').select('email').eq('email', data.email).maybeSingle()
  return { email: masked(data.email), done: !!out }
}

/** The person clicked Unsubscribe (or their mail app did, with one-click List-Unsubscribe). */
export async function unsubscribeByToken(token: unknown): Promise<boolean> {
  if (!validToken(token)) return false
  const db = getServiceClient()
  const { data } = await db.from('ai_unsubscribe_tokens').select('email').eq('token', token).maybeSingle()
  if (!data) return false
  const { error } = await db.from('ai_email_optouts').upsert({ email: data.email, source: 'link' }, { onConflict: 'email', ignoreDuplicates: true })
  if (error) throw new AppError(`Could not unsubscribe: ${error.message}`, 500)
  // Anything already drafted for them is withdrawn too.
  await db
    .from('ai_actions')
    .update({ status: 'cancelled' })
    .eq('status', 'proposed')
    .like('action_type', 'message.%')
    .eq('payload->>channel', 'email')
    .eq('payload->>to', data.email)
  return true
}

export type OptOut = { email: string; source: 'link' | 'owner'; created_at: string }

export async function listOptOuts(): Promise<OptOut[]> {
  const { data, error } = await getServiceClient()
    .from('ai_email_optouts')
    .select('email, source, created_at')
    .order('created_at', { ascending: false })
    .limit(500)
  if (error) throw new AppError(`Could not load the list: ${error.message}`, 500)
  return (data || []) as OptOut[]
}

/** The owner adds someone who asked by reply or phone, or takes off an address added by mistake. */
export async function setOptOut(staff: Staff, email: unknown, on: boolean) {
  const e = normalEmail(email)
  if (!e) throw new AppError('That email address does not look right.', 400)
  const db = getServiceClient()
  const { error } = on
    ? await db.from('ai_email_optouts').upsert({ email: e, source: 'owner', created_by: staff.id }, { onConflict: 'email', ignoreDuplicates: true })
    : await db.from('ai_email_optouts').delete().eq('email', e)
  if (error) throw new AppError(`Could not save: ${error.message}`, 500)
  await logOwner(staff, on ? 'email.opted_out' : 'email.opt_out_removed', { email: e })
}
