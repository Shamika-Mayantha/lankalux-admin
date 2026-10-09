import { jsonErr, jsonOk, readJson, requireStaff } from '@/app/api/v2/_guard'
import { createStaff, isSupervisor, listStaff, requireSupervisorRole, staffFromRequest } from '@/services/staff.service'

export async function GET(request: Request) {
  try {
    const staff = await requireStaff(request)
    const members = await listStaff()
    if (isSupervisor(staff)) return jsonOk({ users: members })
    // Agents only need names to show who a request is assigned to.
    return jsonOk({
      users: members.map((m) => ({ user_id: m.user_id, full_name: m.full_name, email: m.email, role: m.role, active: m.active })),
    })
  } catch (err) {
    return jsonErr(err)
  }
}

export async function POST(request: Request) {
  try {
    const actor = requireSupervisorRole(await staffFromRequest(request))
    const body = await readJson<{ email?: string; full_name?: string; password?: string; role?: string }>(request)
    const user = await createStaff(body, actor)
    return jsonOk({ user }, 201)
  } catch (err) {
    return jsonErr(err, 'Failed to add team member.')
  }
}
