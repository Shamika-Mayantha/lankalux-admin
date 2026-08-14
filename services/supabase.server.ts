import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { requireServerSupabase } from '@/config/env'

let cached: SupabaseClient | null = null

export function getServiceClient(): SupabaseClient {
  if (cached) return cached
  const { url, key } = requireServerSupabase()
  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return cached
}

export function isMissingTableError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '')
  const code = typeof err === 'object' && err && 'code' in err ? String((err as { code?: string }).code) : ''
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    code === 'PGRST204' ||
    /could not find the table/i.test(msg) ||
    /does not exist/i.test(msg) ||
    /schema cache/i.test(msg) ||
    /column .* does not exist/i.test(msg)
  )
}

export class AppError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

export function publicError(err: unknown, fallback: string): string {
  if (err instanceof AppError) return err.message
  if (err instanceof Error && err.message && !/api[_-]?key|password|secret/i.test(err.message)) {
    return err.message
  }
  return fallback
}
