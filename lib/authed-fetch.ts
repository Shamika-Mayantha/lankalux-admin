'use client'

import { supabase } from '@/lib/supabase'

export async function authedFetch(path: string, init: RequestInit = {}) {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Sign in required.')

  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${token}`)
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  const response = await fetch(path, { ...init, headers })
  return response
}

export async function authedJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await authedFetch(path, init)
  const json = await response.json().catch(() => ({ success: false, error: `Request failed (${response.status})` }))
  if (!response.ok || json.success === false) {
    throw new Error(json.error || `Request failed (${response.status})`)
  }
  return json as T
}
