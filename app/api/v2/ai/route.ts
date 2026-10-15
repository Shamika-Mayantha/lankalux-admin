import { jsonErr, jsonOk, readJson } from '@/app/api/v2/_guard'
import { requireSupervisorRole, staffFromRequest } from '@/services/staff.service'
import { getAiOverview, updateAiSettings } from '@/services/ai-console.service'

export async function GET(request: Request) {
  try {
    requireSupervisorRole(await staffFromRequest(request))
    return jsonOk({ overview: await getAiOverview() })
  } catch (err) {
    return jsonErr(err, 'Failed to load the AI system.')
  }
}

export async function PATCH(request: Request) {
  try {
    const staff = requireSupervisorRole(await staffFromRequest(request))
    const body = await readJson<{ system_paused?: unknown; customer_messaging_enabled?: unknown }>(request)
    await updateAiSettings(staff, body)
    return jsonOk({ overview: await getAiOverview() })
  } catch (err) {
    return jsonErr(err, 'Failed to save AI settings.')
  }
}
