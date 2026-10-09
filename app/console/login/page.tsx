'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { consoleFetch } from '@/lib/console-api'
import { BRAND } from '@/config/brand'
import '@/features/console/console.css'

export default function ConsoleLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [reason] = useState(() =>
    typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('reason') : null
  )

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) return
      try {
        await consoleFetch('/api/v2/me')
        router.replace('/console')
      } catch {
        await supabase.auth.signOut()
      }
    })
  }, [router])

  async function submit() {
    setError(null)
    if (!email || !password) {
      setError('Please enter both email and password.')
      return
    }
    setLoading(true)
    const { error: signErr } = await supabase.auth.signInWithPassword({ email, password })
    if (signErr) {
      setError(signErr.message || 'Failed to sign in.')
      setLoading(false)
      return
    }
    try {
      await consoleFetch('/api/v2/me')
    } catch {
      await supabase.auth.signOut()
      setError('This login cannot access admin. Ask a supervisor to add you to the team.')
      setLoading(false)
      return
    }
    router.replace('/console')
  }

  return (
    <div className="ll-login">
      <div className="ll-card ll-login-card">
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <img src={BRAND.logoSrc} alt="LankaLux" />
          <p className="ll-sub" style={{ marginTop: 16, marginBottom: 0 }}>
            Admin Console
          </p>
        </div>
        {reason === 'session_expired' && <div className="ll-error">Session expired. Please log in again.</div>}
        {reason === 'no_access' && (
          <div className="ll-error">This login cannot access admin. Ask a supervisor to add you to the team.</div>
        )}
        <div className="ll-form">
          <label>
            Email
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
          </label>
          <label>
            Password
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              onKeyDown={(e) => e.key === 'Enter' && submit()}
            />
          </label>
          {error && <div className="ll-error">{error}</div>}
          <button className="ll-btn" disabled={loading} onClick={submit}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </div>
      </div>
    </div>
  )
}
