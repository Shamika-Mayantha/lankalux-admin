import { NextResponse } from 'next/server'
import { AppError, getServiceClient } from '@/services/supabase.server'
import { assertRequestAccess, isSupervisor, requireSupervisorRole, staffFromRequest, type Staff } from '@/services/staff.service'

export class ApiError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

type Actor = { id: string; email: string | null; staff: Staff }

function actor(staff: Staff): Actor {
  return { id: staff.id, email: staff.email ?? null, staff }
}

/** Supervisor-only invoice routes (settings, payments feed). */
export async function requireAdmin(request: Request): Promise<Actor> {
  return actor(requireSupervisorRole(await staffFromRequest(request)))
}

/** Any staff login; callers filter what an agent sees. */
export async function requireStaff(request: Request): Promise<Actor> {
  return actor(await staffFromRequest(request))
}

/** Staff who may see the request this invoice belongs to. */
export async function requireInvoiceAccess(request: Request, invoiceId: string): Promise<Actor> {
  const staff = await staffFromRequest(request)
  if (!isSupervisor(staff)) {
    const { data } = await getServiceClient().from('invoices').select('request_id').eq('id', invoiceId).maybeSingle()
    if (!data?.request_id) throw new ApiError('Invoice not found.', 404)
    await assertRequestAccess(staff, String(data.request_id))
  }
  return actor(staff)
}

/** Staff who may see this request. */
export async function requireRequestAccess(request: Request, requestId: string): Promise<Actor> {
  const staff = await staffFromRequest(request)
  await assertRequestAccess(staff, requestId)
  return actor(staff)
}

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T
  } catch {
    throw new ApiError('Invalid JSON body.', 400)
  }
}

export function ok(data: Record<string, unknown>, status = 200) {
  return NextResponse.json({ success: true, ...data }, { status })
}

export function fail(error: unknown, fallback = 'Request failed') {
  if (error instanceof ApiError || error instanceof AppError) {
    return NextResponse.json({ success: false, error: error.message }, { status: error.status })
  }
  const message = error instanceof Error && error.message ? error.message : fallback
  return NextResponse.json({ success: false, error: message }, { status: 500 })
}
