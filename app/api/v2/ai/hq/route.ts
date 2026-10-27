import { jsonErr, jsonOk } from '@/app/api/v2/_guard'
import { requireSupervisorRole, staffFromRequest } from '@/services/staff.service'
import { getHqSnapshot } from '@/services/ai-hq.service'

/** The AI Headquarters' data: the last day on first load, then only what changed `since`. */
export async function GET(request: Request) {
  try {
    requireSupervisorRole(await staffFromRequest(request))
    const since = new URL(request.url).searchParams.get('since')
    return jsonOk({ hq: await getHqSnapshot(since) })
  } catch (err) {
    return jsonErr(err, 'Failed to load the AI Headquarters.')
  }
}
