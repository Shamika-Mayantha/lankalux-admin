import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { AppError } from '@/services/supabase.server'

export class ApiError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

function serverSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new ApiError('Server configuration error.', 500)
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

export async function requireAdmin(request: Request): Promise<{ id: string; email: string | null }> {
  const authHeader = request.headers.get('authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''
  if (!token) throw new ApiError('Sign in required.', 401)
  const supabase = serverSupabase()
  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data.user) throw new ApiError('Sign in required.', 401)
  return { id: data.user.id, email: data.user.email || null }
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
