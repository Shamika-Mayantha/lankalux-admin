import { jsonErr, jsonOk } from '@/app/api/v2/_guard'
import { requireSupervisorRole, staffFromRequest } from '@/services/staff.service'
import { listOptOuts, setOptOut } from '@/services/unsubscribe.service'

/** The do-not-email list: people the AI never emails again. */
export async function GET(request: Request) {
  try {
    requireSupervisorRole(await staffFromRequest(request))
    return jsonOk({ optouts: await listOptOuts() })
  } catch (err) {
    return jsonErr(err, 'Failed to load the list.')
  }
}

/** { email, on: true } adds someone (they asked by reply or phone); { email, on: false } takes them off. */
export async function POST(request: Request) {
  try {
    const staff = requireSupervisorRole(await staffFromRequest(request))
    const body = (await request.json().catch(() => ({}))) as { email?: unknown; on?: unknown }
    await setOptOut(staff, body.email, body.on !== false)
    return jsonOk({ optouts: await listOptOuts() })
  } catch (err) {
    return jsonErr(err, 'Failed to save.')
  }
}
