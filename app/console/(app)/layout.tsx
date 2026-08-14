'use client'

import { ConsoleShell } from '@/features/console/ConsoleShell'

export default function ConsoleAuthedLayout({ children }: { children: React.ReactNode }) {
  return <ConsoleShell>{children}</ConsoleShell>
}
