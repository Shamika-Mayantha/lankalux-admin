import { NextResponse } from 'next/server'
import { AppError, publicError, getServiceClient } from '@/services/supabase.server'
import type { User } from '@supabase/supabase-js'

export async function requireAdmin(request: Request): Promise<User> {
  const header = request.headers.get('authorization')
  const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (!token) throw new AppError('Sign in required.', 401)
  const supabase = getServiceClient()
  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data.user) throw new AppError('Sign in required.', 401)
  return data.user
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
