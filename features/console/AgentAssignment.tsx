'use client'

import { useIsSupervisor } from '@/features/console/StaffContext'
import { memberName, useTeam } from '@/features/console/useTeam'
import type { ClientRequestRow } from '@/types/domain'

/** Supervisors pick the agent responsible for a request; agents just see who it is. */
export function AgentAssignment({
  row,
  disabled,
  onAssign,
}: {
  row: ClientRequestRow
  disabled?: boolean
  onAssign: (userId: string | null) => void
}) {
  const supervisor = useIsSupervisor()
  const team = useTeam()
  const assigned = memberName(team, row.assigned_agent_id)
  const creator = memberName(team, row.created_by)

  return (
    <div className="ll-row ll-muted" style={{ marginTop: 6 }}>
      <span>Agent:</span>
      {supervisor ? (
        <select
          aria-label="Assign to agent"
          value={row.assigned_agent_id || ''}
          disabled={disabled}
          onChange={(e) => onAssign(e.target.value || null)}
        >
          <option value="">Unassigned</option>
          {team
            .filter((m) => m.active || m.user_id === row.assigned_agent_id)
            .map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.full_name || m.email}
                {m.role === 'supervisor' ? ' (supervisor)' : ''}
              </option>
            ))}
        </select>
      ) : (
        <strong>{assigned || 'Unassigned'}</strong>
      )}
      {creator ? <span>· Created by {creator}</span> : null}
    </div>
  )
}
