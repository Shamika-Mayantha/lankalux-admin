import { createClient, type User } from '@supabase/supabase-js'
import { isLankaLuxAdminEmail } from '@/lib/admin-email'
import { AppError, getServiceClient, isMissingTableError } from '@/services/supabase.server'
import type { StaffMember, StaffRole } from '@/types/domain'

export type Staff = {
  user: User
  id: string
  email: string | undefined
  name: string
  role: StaffRole
}

const STAFF_TABLE = 'admin_users'
const MIN_PASSWORD = 8

function isRole(value: unknown): value is StaffRole {
  return value === 'supervisor' || value === 'agent'
}

function bearer(request: Request): string {
  const header = request.headers.get('authorization') || ''
  return header.startsWith('Bearer ') ? header.slice(7).trim() : ''
}

/** Resolves a signed-in Supabase user to a staff login, or null when they have no admin access. */
export async function resolveStaff(user: User): Promise<Staff | null> {
  const supabase = getServiceClient()
  const { data, error } = await supabase.from(STAFF_TABLE).select('*').eq('user_id', user.id).maybeSingle()
  if (error && !isMissingTableError(error)) throw new AppError(`Supabase request failed: ${error.message}`, 500)
  const row = (error ? null : data) as StaffMember | null
  const email = user.email

  // The main account is always a supervisor, even before the staff migration has run.
  if (isLankaLuxAdminEmail(email)) {
    return { user, id: user.id, email, name: row?.full_name || 'LankaLux', role: 'supervisor' }
  }
  if (!row || !row.active || !isRole(row.role)) return null
  return { user, id: user.id, email, name: row.full_name || email || 'Staff', role: row.role }
}

export async function staffFromRequest(request: Request): Promise<Staff> {
  const token = bearer(request)
  if (!token) throw new AppError('Sign in required.', 401)
  const supabase = getServiceClient()
  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data.user) throw new AppError('Sign in required.', 401)
  const staff = await resolveStaff(data.user)
  if (!staff) throw new AppError('This login cannot access admin.', 403)
  return staff
}

export function isSupervisor(staff: Staff): boolean {
  return staff.role === 'supervisor'
}

export function requireSupervisorRole(staff: Staff): Staff {
  if (!isSupervisor(staff)) throw new AppError('Only a supervisor can do this.', 403)
  return staff
}

type Ownership = { created_by?: string | null; assigned_agent_id?: string | null }

export function canSeeRequest(staff: Staff, row: Ownership): boolean {
  if (isSupervisor(staff)) return true
  return row.created_by === staff.id || row.assigned_agent_id === staff.id
}

/** Throws 404 (not 403) so agents cannot probe which request IDs exist. */
export async function assertRequestAccess(staff: Staff, requestId: string): Promise<void> {
  if (isSupervisor(staff)) return
  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from('Client Requests')
    .select('id, created_by, assigned_agent_id')
    .eq('id', requestId)
    .maybeSingle()
  if (error || !data || !canSeeRequest(staff, data as Ownership)) throw new AppError('Request not found', 404)
}

/** Request IDs an agent may see; null means every request (supervisors). */
export async function accessibleRequestIds(staff: Staff): Promise<Set<string> | null> {
  if (isSupervisor(staff)) return null
  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from('Client Requests')
    .select('id')
    .or(`created_by.eq.${staff.id},assigned_agent_id.eq.${staff.id}`)
  if (error) throw new AppError(`Supabase request failed: ${error.message}`, 500)
  return new Set((data || []).map((r) => String(r.id)))
}

/** A supervisor can only assign requests to an active team login. */
export async function assertAssignable(userId: string | null | undefined): Promise<void> {
  if (!userId) return
  const supabase = getServiceClient()
  const { data, error } = await supabase.from(STAFF_TABLE).select('active').eq('user_id', userId).maybeSingle()
  if (error) throw new AppError(`Supabase request failed: ${error.message}`, 500)
  if (!data?.active) throw new AppError('Choose an active team member to assign.')
}

export async function listStaff(): Promise<StaffMember[]> {
  const supabase = getServiceClient()
  const { data, error } = await supabase.from(STAFF_TABLE).select('*').order('created_at', { ascending: true })
  if (error) {
    if (isMissingTableError(error)) {
      throw new AppError('Team logins need the staff_roles database migration. Run it in Supabase first.', 500)
    }
    throw new AppError(`Supabase request failed: ${error.message}`, 500)
  }
  return (data || []) as StaffMember[]
}

function validatePassword(password: unknown): string {
  const value = typeof password === 'string' ? password : ''
  if (value.length < MIN_PASSWORD) throw new AppError(`Password must be at least ${MIN_PASSWORD} characters.`)
  return value
}

export async function createStaff(
  input: { email?: string; full_name?: string; password?: string; role?: string },
  actor: Staff
): Promise<StaffMember> {
  const email = String(input.email || '').trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AppError('Enter a valid email address.')
  const fullName = String(input.full_name || '').trim()
  if (!fullName) throw new AppError('Name is required.')
  const role: StaffRole = isRole(input.role) ? input.role : 'agent'
  const password = validatePassword(input.password)

  const supabase = getServiceClient()
  // Fail early with a clear message when the table is missing.
  await listStaff()

  const { data: created, error: createErr } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  })
  if (createErr || !created.user) {
    if (/already|registered|exists/i.test(createErr?.message || '')) {
      throw new AppError('A login with this email already exists.', 409)
    }
    throw new AppError(createErr?.message || 'Failed to create login.', 500)
  }

  const row = {
    user_id: created.user.id,
    email,
    full_name: fullName,
    role,
    active: true,
    created_by: actor.id,
  }
  const { data, error } = await supabase.from(STAFF_TABLE).insert(row).select('*').single()
  if (error || !data) {
    // Don't leave a login behind that has no staff record.
    await supabase.auth.admin.deleteUser(created.user.id).catch(() => {})
    throw new AppError(error?.message || 'Failed to save team member.', 500)
  }
  return data as StaffMember
}

export async function updateStaff(
  userId: string,
  patch: { full_name?: string; role?: string; active?: boolean; password?: string },
  actor: Staff
): Promise<StaffMember> {
  const supabase = getServiceClient()
  const { data: current, error: readErr } = await supabase.from(STAFF_TABLE).select('*').eq('user_id', userId).maybeSingle()
  if (readErr) throw new AppError(`Supabase request failed: ${readErr.message}`, 500)
  if (!current) throw new AppError('Team member not found.', 404)
  const member = current as StaffMember

  const next: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (patch.full_name !== undefined) {
    const name = String(patch.full_name).trim()
    if (!name) throw new AppError('Name is required.')
    next.full_name = name
  }
  if (patch.role !== undefined) {
    if (!isRole(patch.role)) throw new AppError('Role must be supervisor or agent.')
    next.role = patch.role
  }
  if (patch.active !== undefined) next.active = Boolean(patch.active)

  const protectedAccount = isLankaLuxAdminEmail(member.email)
  if (protectedAccount && (next.role === 'agent' || next.active === false)) {
    throw new AppError('The main LankaLux account always stays an active supervisor.')
  }
  if (userId === actor.id && (next.role === 'agent' || next.active === false)) {
    throw new AppError('You cannot remove your own supervisor access.')
  }

  if (patch.password !== undefined) {
    const password = validatePassword(patch.password)
    const { error } = await supabase.auth.admin.updateUserById(userId, { password })
    if (error) throw new AppError(error.message || 'Failed to set password.', 500)
  }
  if (patch.active !== undefined && Boolean(patch.active) !== member.active) {
    // A ban stops a deactivated login from signing in or refreshing its session.
    const { error } = await supabase.auth.admin.updateUserById(userId, {
      ban_duration: patch.active ? 'none' : '876000h',
    })
    if (error) throw new AppError(error.message || 'Failed to update login.', 500)
  }

  const { data, error } = await supabase.from(STAFF_TABLE).update(next).eq('user_id', userId).select('*').single()
  if (error || !data) throw new AppError(error?.message || 'Failed to update team member.', 500)
  return data as StaffMember
}

/** Verifies the current password with a throwaway anon client, then sets the new one. */
export async function changeOwnPassword(staff: Staff, currentPassword: unknown, newPassword: unknown): Promise<void> {
  const current = typeof currentPassword === 'string' ? currentPassword : ''
  if (!current) throw new AppError('Enter your current password.')
  const password = validatePassword(newPassword)
  if (password === current) throw new AppError('Choose a password different from the current one.')
  if (!staff.email) throw new AppError('This login has no email address.', 400)

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) throw new AppError('Server configuration error.', 500)
  const verifier = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await verifier.auth.signInWithPassword({ email: staff.email, password: current })
  if (error || data.user?.id !== staff.id) throw new AppError('Current password is incorrect.', 400)

  const { error: updateErr } = await getServiceClient().auth.admin.updateUserById(staff.id, { password })
  if (updateErr) throw new AppError(updateErr.message || 'Failed to change password.', 500)
}
