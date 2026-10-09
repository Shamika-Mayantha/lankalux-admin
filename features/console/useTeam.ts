'use client'

import { useEffect, useState } from 'react'
import { consoleFetch } from '@/lib/console-api'
import type { StaffMember } from '@/types/domain'

export type TeamMember = Pick<StaffMember, 'user_id' | 'full_name' | 'email' | 'role' | 'active'>

/** Staff logins, for showing and picking who a request is assigned to. */
export function useTeam(): TeamMember[] {
  const [team, setTeam] = useState<TeamMember[]>([])
  useEffect(() => {
    consoleFetch('/api/v2/users')
      .then((d) => setTeam(d.users || []))
      .catch(() => setTeam([]))
  }, [])
  return team
}

export function memberName(team: TeamMember[], userId: string | null | undefined): string | null {
  if (!userId) return null
  const m = team.find((t) => t.user_id === userId)
  return m ? m.full_name || m.email : null
}
