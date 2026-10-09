'use client'

import { supabase } from '@/lib/supabase'
import { markConsoleCacheStale, revalidate, useConsoleResource } from '@/lib/console-cache'

export { useConsoleResource }

export async function consoleFetch(path: string, init: RequestInit = {}) {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) {
    throw new Error('Sign in required.')
  }
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${token}`)
  const isFormData = typeof FormData !== 'undefined' && init.body instanceof FormData
  if (init.body && !headers.has('Content-Type') && !isFormData) headers.set('Content-Type', 'application/json')
  const method = (init.method || 'GET').toUpperCase()
  if (method !== 'GET' && method !== 'HEAD') markConsoleCacheStale()
  const res = await fetch(path, { ...init, headers })
  const json = await res.json().catch(() => ({ success: false, error: `Server error (${res.status})` }))
  if (!res.ok || json.success === false) {
    throw new Error(json.error || `Request failed (${res.status})`)
  }
  return json
}

/** GET through the shared console cache, so pages that need the same list share one call. */
export function consoleGet<T = Record<string, unknown>>(path: string): Promise<T> {
  return revalidate<T>(`get:${path}`, () => consoleFetch(path))
}

/** Cached GET for a page: shows the last result instantly on revisit, then refreshes it. */
export function useConsoleGet<T = Record<string, unknown>>(path: string | null) {
  return useConsoleResource<T>(path ? `get:${path}` : null, () => consoleFetch(path as string))
}

/** Run `fn` over `items` with at most `limit` calls in flight, keeping input order. */
export async function mapLimited<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length)
  let next = 0
  async function worker() {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}
