'use client'

import { useInactivityLogout } from '@/hooks/useInactivityLogout'

export function InactivityProvider({ children }: { children: React.ReactNode }) {
  useInactivityLogout()
  return <>{children}</>
}
