import { jsonErr, jsonOk, readJson, requireStaff } from '@/app/api/v2/_guard'
import { createRequest, listRequests } from '@/services/request.service'
import { assertAssignable, isSupervisor } from '@/services/staff.service'
import type { RequestInput } from '@/types/domain'

export async function GET(request: Request) {
  try {
    const staff = await requireStaff(request)
    const rows = await listRequests(isSupervisor(staff) ? undefined : { visibleTo: staff.id })
    return jsonOk({ requests: rows })
  } catch (err) {
    return jsonErr(err, 'Supabase request failed.')
  }
}

export async function POST(request: Request) {
  try {
    const staff = await requireStaff(request)
    const body = await readJson<RequestInput>(request)
    // Only a supervisor picks the agent; an agent's own requests stay theirs via created_by.
    if (!isSupervisor(staff)) delete body.assigned_agent_id
    else await assertAssignable(body.assigned_agent_id)
    const created = await createRequest(body, staff.email, staff.id)
    return jsonOk({ request: created }, 201)
  } catch (err) {
    return jsonErr(err, 'Failed to create request.')
  }
}
