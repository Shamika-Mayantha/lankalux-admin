'use client'

import { createContext, useContext } from 'react'
import type { StaffRole } from '@/types/domain'

export type Me = { id: string; email: string | null; name: string; role: StaffRole }

const StaffContext = createContext<Me | null>(null)

export const StaffProvider = StaffContext.Provider

/** The signed-in staff login. Only available inside the console shell. */
export function useMe(): Me {
  const me = useContext(StaffContext)
  if (!me) throw new Error('useMe must be used inside the console shell.')
  return me
}

export function useIsSupervisor(): boolean {
  return useMe().role === 'supervisor'
}
