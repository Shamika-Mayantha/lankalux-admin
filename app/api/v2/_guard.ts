import { NextResponse } from 'next/server'
import { AppError, publicError } from '@/services/supabase.server'
import { assertRequestAccess, requireSupervisorRole, staffFromRequest, type Staff } from '@/services/staff.service'
import type { User } from '@supabase/supabase-js'

/** Supervisor-only routes. Returns the Supabase user for existing callers. */
export async function requireAdmin(request: Request): Promise<User> {
  const staff = await staffFromRequest(request)
  return requireSupervisorRole(staff).user
}

/** Any active staff login (supervisor or agent). */
export async function requireStaff(request: Request): Promise<Staff> {
  return staffFromRequest(request)
}

/** Any staff login that may see this request: supervisors, its creator, or its assigned agent. */
export async function requireRequestAccess(request: Request, requestId: string): Promise<Staff> {
  const staff = await staffFromRequest(request)
  await assertRequestAccess(staff, requestId)
  return staff
}

export function jsonOk(data: unknown, status = 200) {
  return NextResponse.json({ success: true, ...((data && typeof data === 'object') ? data : { data }) }, { status })
}

export function jsonErr(err: unknown, fallback = 'Request failed') {
  const message = publicError(err, fallback)
  const status = err instanceof AppError ? err.status : 500
  console.error('[api/v2]', message, err)
  return NextResponse.json({ success: false, error: message }, { status })
}

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T
  } catch {
    throw new AppError('Invalid JSON body', 400)
  }
}

/** For legacy routes: returns a 401/403 response when the caller is not the admin, otherwise null. */
export async function rejectNonAdmin(request: Request): Promise<NextResponse | null> {
  try {
    await requireAdmin(request)
    return null
  } catch (err) {
    const status = err instanceof AppError ? err.status : 401
    return NextResponse.json({ success: false, error: publicError(err, 'Sign in required.') }, { status })
  }
}
