import { jsonErr, jsonOk } from '@/app/api/v2/_guard'
import { requireSupervisorRole, staffFromRequest } from '@/services/staff.service'
import { listClaudeBots } from '@/services/claude-bots.service'

/** The weekly Claude bots and their latest runs. */
export async function GET(request: Request) {
  try {
    requireSupervisorRole(await staffFromRequest(request))
    return jsonOk({ bots: await listClaudeBots() })
  } catch (err) {
    return jsonErr(err, 'Failed to load the Claude bots.')
  }
}
