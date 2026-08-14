'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { BRAND } from '@/config/brand'
import '@/features/console/console.css'

export default function ConsoleLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [expired] = useState(() =>
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('reason') === 'session_expired'
  )

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace('/console')
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
    router.replace('/console')
  }

  return (
    <div className="ll-login">
      <div className="ll-card" style={{ width: 380 }}>
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <img src={BRAND.logoSrc} alt="LankaLux" width={64} height={64} style={{ borderRadius: '50%' }} />
          <h1 className="ll-h1" style={{ fontSize: 26 }}>LankaLux</h1>
          <p className="ll-sub">Admin Console</p>
        </div>
        {expired && <div className="ll-error">Session expired. Please log in again.</div>}
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
