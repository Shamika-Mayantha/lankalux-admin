'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import {
  BedDouble,
  Car,
  CreditCard,
  FileText,
  Globe,
  Inbox,
  LayoutDashboard,
  LogOut,
  Mail,
  Map as MapIcon,
  Menu,
  Plus,
  Settings,
  Sparkles,
  TrendingUp,
  UserCog,
  Users,
  X,
  type LucideIcon,
  Wallet,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { consoleFetch } from '@/lib/console-api'
import { INACTIVITY_MS } from '@/config/status'
import { BRAND } from '@/config/brand'
import { StaffProvider, type Me } from '@/features/console/StaffContext'
import { useFollowUps } from '@/features/requests/FollowUpPanel'
import { useConsoleGet } from '@/lib/console-api'
import type { AiOverview } from '@/services/ai-console.service'

type NavItem = { href: string; label: string; icon: LucideIcon }

const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: 'Overview',
    items: [
      { href: '/console', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/console/ai', label: 'AI agents', icon: Sparkles },
      { href: '/console/performance', label: 'Performance', icon: TrendingUp },
    ],
  },
  {
    label: 'Sales',
    items: [
      { href: '/console/requests', label: 'Requests', icon: Inbox },
      { href: '/console/clients', label: 'Clients', icon: Users },
      { href: '/console/communications', label: 'Messages', icon: Mail },
      { href: '/console/itineraries', label: 'Itineraries', icon: MapIcon },
    ],
  },
  {
    label: 'Finance',
    items: [
      { href: '/console/finance', label: 'Profit & expenses', icon: Wallet },
      { href: '/console/invoices', label: 'Invoices', icon: FileText },
      { href: '/console/payments', label: 'Payments', icon: CreditCard },
    ],
  },
  {
    label: 'Operations',
    items: [
      { href: '/console/hotels', label: 'Hotels', icon: BedDouble },
      { href: '/console/vehicles', label: 'Vehicles', icon: Car },
      { href: '/console/team', label: 'Team', icon: UserCog },
    ],
  },
  {
    label: 'Admin',
    items: [
      { href: '/console/website', label: 'Website', icon: Globe },
      { href: '/console/settings', label: 'Settings', icon: Settings },
    ],
  },
]

const NAV = NAV_GROUPS.flatMap((g) => g.items)

function isActive(pathname: string, href: string) {
  return pathname === href || (href !== '/console' && pathname.startsWith(`${href}/`))
}

function initials(me: Me) {
  const source = (me.name && me.name !== me.email ? me.name : me.email || '?').trim()
  const parts = source.split(/[\s@.]+/).filter(Boolean)
  return ((parts[0]?.[0] || '?') + (parts.length > 1 && me.name !== me.email ? parts[1][0] : '')).toUpperCase()
}

/** Pages hidden from agents; their API routes use requireAdmin, which also refuses agents. */
const SUPERVISOR_ONLY = ['/console/performance', '/console/finance', '/console/ai', '/console/payments', '/console/team', '/console/website']

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

  useEffect(() => {
    const item = NAV.find((i) => isActive(pathname, i.href))
    document.title = item ? `${item.label} · LankaLux Admin` : 'LankaLux Admin Console'
  }, [pathname])

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
  const groups = NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter((item) => supervisor || !supervisorOnly(item.href)) })).filter((g) => g.items.length)
  const blocked = !supervisor && supervisorOnly(pathname)
  const current = NAV.find((i) => isActive(pathname, i.href))

  return (
    <StaffProvider value={me}>
      <div className={`ll-shell ${navOpen ? 'nav-open' : ''}`}>
        <aside className="ll-side" aria-label="Main menu">
          <div className="ll-side-head">
            <Link href="/console" className="ll-brand" onClick={() => setNavOpen(false)}>
              <img src={BRAND.logoMarkSrc} alt="" />
              <span>
                LankaLux
                <small>Admin</small>
              </span>
            </Link>
            <button type="button" className="ll-icon-btn ll-side-close" aria-label="Close menu" onClick={() => setNavOpen(false)}>
              <X size={18} />
            </button>
          </div>
          <nav>
            {groups.map((g) => (
              <div className="ll-nav-group" key={g.label}>
                <p className="ll-nav-label">{g.label}</p>
                {g.items.map((item) => {
                  const Icon = item.icon
                  const active = isActive(pathname, item.href)
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={active ? 'active' : ''}
                      aria-current={active ? 'page' : undefined}
                      onClick={() => setNavOpen(false)}
                    >
                      <Icon size={17} strokeWidth={1.75} aria-hidden />
                      <span>{item.label}</span>
                      {item.href === '/console/requests' ? <FollowUpBadge /> : null}
                      {item.href === '/console/ai' && supervisor ? <AiBadge /> : null}
                    </Link>
                  )
                })}
              </div>
            ))}
          </nav>
          <div className="ll-side-foot">
            <span className="ll-avatar" aria-hidden>
              {initials(me)}
            </span>
            <span className="ll-me">
              <strong>{me.name && me.name !== me.email ? me.name : me.email}</strong>
              <small>{supervisor ? 'Supervisor' : 'Agent'}</small>
            </span>
            <button type="button" className="ll-icon-btn" aria-label="Log out" title="Log out" onClick={logout}>
              <LogOut size={17} />
            </button>
          </div>
        </aside>
        <div className="ll-backdrop" onClick={() => setNavOpen(false)} />
        <div className="ll-frame">
          <header className="ll-top">
            <button type="button" className="ll-icon-btn ll-menu-btn" aria-label="Open menu" onClick={() => setNavOpen(true)}>
              <Menu size={20} />
            </button>
            <p className="ll-top-title">{current?.label || 'LankaLux'}</p>
            <div className="ll-top-actions">
              <Link href="/console/requests/new" className="ll-btn small">
                <Plus size={16} aria-hidden />
                <span>New request</span>
              </Link>
            </div>
          </header>
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

/** Live dot plus the number of AI actions waiting for the owner. */
function AiBadge() {
  const { data } = useConsoleGet<{ overview?: AiOverview }>('/api/v2/ai')
  const o = data?.overview
  if (!o) return null
  const waiting = o.pending.length
  if (waiting) {
    return (
      <span className="ll-nav-badge gold" title={`${waiting} waiting for your approval`}>
        {waiting}
      </span>
    )
  }
  return <span className={`ll-live-dot ${o.settings.system_paused ? 'off' : ''}`} title={o.settings.system_paused ? 'Paused' : 'Running'} />
}

/** Count of clients waiting on a reply from us, next to Requests in the side nav. */
function FollowUpBadge() {
  const { data } = useFollowUps()
  const waiting = (data?.items || []).filter((i) => i.kind === 'reply').length
  if (!waiting) return null
  return (
    <span className="ll-nav-badge" title={`${waiting} waiting for a reply`}>
      {waiting}
    </span>
  )
}
