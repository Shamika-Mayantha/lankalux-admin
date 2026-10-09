'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { consoleFetch } from '@/lib/console-api'
import { INACTIVITY_MS } from '@/config/status'
import { BRAND } from '@/config/brand'
import { StaffProvider, type Me } from '@/features/console/StaffContext'

const NAV = [
  { href: '/console', label: 'Dashboard' },
  { href: '/console/requests', label: 'Requests' },
  { href: '/console/itineraries', label: 'Itineraries' },
  { href: '/console/invoices', label: 'Invoices' },
  { href: '/console/payments', label: 'Payments' },
  { href: '/console/team', label: 'Team' },
  { href: '/console/hotels', label: 'Hotels' },
  { href: '/console/vehicles', label: 'Vehicles' },
  { href: '/console/clients', label: 'Clients' },
  { href: '/console/communications', label: 'Communications' },
  { href: '/console/settings', label: 'Settings' },
]

/** Pages hidden from agents; their API routes use requireAdmin, which also refuses agents. */
const SUPERVISOR_ONLY = ['/console/payments', '/console/team', '/console/website']

function supervisorOnly(href: string) {
  return SUPERVISOR_ONLY.some((p) => href === p || href.startsWith(`${p}/`))
}

export function ConsoleShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [me, setMe] = useState<Me | null>(null)
  const [navOpen, setNavOpen] = useState(false)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const reset = () => {
      clearTimeout(timer)
      timer = setTimeout(async () => {
        await supabase.auth.signOut()
        router.push('/console/login?reason=session_expired')
      }, INACTIVITY_MS)
    }
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart']
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }))
    reset()
    return () => {
      clearTimeout(timer)
      events.forEach((e) => window.removeEventListener(e, reset))
    }
  }, [router])

  useEffect(() => {
    let mounted = true
    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return
      if (!data.session) {
        router.replace('/console/login')
        return
      }
      try {
        const json = await consoleFetch('/api/v2/me')
        if (!mounted) return
        setMe(json.me as Me)
        setReady(true)
      } catch {
        await supabase.auth.signOut()
        router.replace('/console/login?reason=no_access')
      }
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session) router.replace('/console/login')
    })
    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [router])

  if (!ready || !me) {
    return (
      <div className="ll-boot">
        <img src={BRAND.logoSrc} alt="LankaLux" style={{ height: 48 }} />
        <p className="ll-muted">Loading console…</p>
      </div>
    )
  }

  async function logout() {
    await supabase.auth.signOut()
    router.push('/console/login')
  }

  const supervisor = me.role === 'supervisor'
  const nav = NAV.filter((item) => supervisor || !supervisorOnly(item.href))
  const blocked = !supervisor && supervisorOnly(pathname)

  return (
    <StaffProvider value={me}>
      <div className={`ll-shell ${navOpen ? 'nav-open' : ''}`}>
        <header className="ll-top">
          <Link href="/console" className="ll-lockup" aria-label="LankaLux">
            <img src={BRAND.logoSrc} alt="LankaLux" />
          </Link>
          <div className="ll-top-actions">
            <span>
              {me.name && me.name !== me.email ? `${me.name} · ` : ''}
              {me.email}
            </span>
            <button type="button" className="ll-btn secondary" onClick={logout}>
              Logout
            </button>
            <button type="button" className="ll-menu-btn" aria-label="Open navigation" onClick={() => setNavOpen((v) => !v)}>
              <span />
              <span />
              <span />
            </button>
          </div>
        </header>
        <div className="ll-backdrop" onClick={() => setNavOpen(false)} />
        <div className="ll-body">
          <aside className="ll-side">
            <nav>
              {nav.map((item) => {
                const active = pathname === item.href || (item.href !== '/console' && pathname.startsWith(item.href))
                return (
                  <Link key={item.href} href={item.href} className={active ? 'active' : ''} onClick={() => setNavOpen(false)}>
                    {item.label}
                  </Link>
                )
              })}
            </nav>
            <div className="ll-side-foot">
              <p>{supervisor ? 'Supervisor' : 'Agent'} console</p>
            </div>
          </aside>
          <main className="ll-main">
            {blocked ? (
              <div className="ll-card">
                <h3>Supervisor only</h3>
                <p className="ll-muted">Ask a supervisor if you need something from this page.</p>
              </div>
            ) : (
              children
            )}
          </main>
        </div>
      </div>
    </StaffProvider>
  )
}
