import { jsonErr, jsonOk, readJson } from '@/app/api/v2/_guard'
import { requireSupervisorRole, staffFromRequest } from '@/services/staff.service'
import { getAiOverview, setAgentPaused } from '@/services/ai-console.service'

type Ctx = { params: Promise<{ key: string }> }

export async function PATCH(request: Request, ctx: Ctx) {
  try {
    const staff = requireSupervisorRole(await staffFromRequest(request))
    const { key } = await ctx.params
    const body = await readJson<{ paused?: unknown }>(request)
    await setAgentPaused(staff, key, body.paused)
    return jsonOk({ overview: await getAiOverview() })
  } catch (err) {
    return jsonErr(err, 'Failed to update the agent.')
  }
}
