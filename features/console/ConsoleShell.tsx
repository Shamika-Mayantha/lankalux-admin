'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { INACTIVITY_MS } from '@/config/status'
import { BRAND } from '@/config/brand'

const NAV = [
  { href: '/console', label: 'Dashboard' },
  { href: '/console/requests', label: 'Requests' },
  { href: '/console/itineraries', label: 'Itineraries' },
  { href: '/console/hotels', label: 'Hotels' },
  { href: '/console/vehicles', label: 'Vehicles' },
  { href: '/console/clients', label: 'Clients' },
  { href: '/console/communications', label: 'Communications' },
  { href: '/console/settings', label: 'Settings' },
]

export function ConsoleShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [email, setEmail] = useState<string | null>(null)

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
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      if (!data.session) {
        router.replace('/console/login')
        return
      }
      setEmail(data.session.user.email ?? null)
      setReady(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session) router.replace('/console/login')
    })
    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [router])

  if (!ready) {
    return (
      <div className="ll-boot">
        <p>Loading console…</p>
      </div>
    )
  }

  async function logout() {
    await supabase.auth.signOut()
    router.push('/console/login')
  }

  return (
    <div className="ll-shell">
      <aside className="ll-side">
        <div className="ll-brand">
          <img src={BRAND.logoSrc} alt="" />
          <div>
            <strong>LankaLux</strong>
            <span>Admin Console</span>
          </div>
        </div>
        <nav>
          {NAV.map((item) => {
            const active = pathname === item.href || (item.href !== '/console' && pathname.startsWith(item.href))
            return (
              <Link key={item.href} href={item.href} className={active ? 'active' : ''}>
                {item.label}
              </Link>
            )
          })}
        </nav>
        <div className="ll-side-foot">
          <p>{email}</p>
          <button type="button" onClick={logout}>
            Logout
          </button>
        </div>
      </aside>
      <main className="ll-main">{children}</main>
    </div>
  )
}
