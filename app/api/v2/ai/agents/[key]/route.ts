import { jsonErr, jsonOk, readJson } from '@/app/api/v2/_guard'
import { requireSupervisorRole, staffFromRequest } from '@/services/staff.service'
import { getAgentInstructions, getAiOverview, setAgentPaused, updateAgentInstructions } from '@/services/ai-console.service'

type Ctx = { params: Promise<{ key: string }> }

export async function GET(request: Request, ctx: Ctx) {
  try {
    requireSupervisorRole(await staffFromRequest(request))
    const { key } = await ctx.params
    return jsonOk(await getAgentInstructions(key))
  } catch (err) {
    return jsonErr(err, 'Failed to load the agent.')
  }
}

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

/** Saves the owner's extra instructions for the agent. */
export async function PUT(request: Request, ctx: Ctx) {
  try {
    const staff = requireSupervisorRole(await staffFromRequest(request))
    const { key } = await ctx.params
    const body = await readJson<{ instructions?: unknown }>(request)
    return jsonOk(await updateAgentInstructions(staff, key, body.instructions))
  } catch (err) {
    return jsonErr(err, 'Failed to save the instructions.')
  }
}
