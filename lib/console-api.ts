'use client'

import { supabase } from '@/lib/supabase'

export async function consoleFetch(path: string, init: RequestInit = {}) {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) {
    throw new Error('Sign in required.')
  }
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${token}`)
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const res = await fetch(path, { ...init, headers })
  const json = await res.json().catch(() => ({ success: false, error: `Server error (${res.status})` }))
  if (!res.ok || json.success === false) {
    throw new Error(json.error || `Request failed (${res.status})`)
  }
  return json
}
