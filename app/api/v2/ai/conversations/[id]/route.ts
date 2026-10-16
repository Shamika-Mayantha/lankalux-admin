import { jsonErr, jsonOk, readJson } from '@/app/api/v2/_guard'
import { requireSupervisorRole, staffFromRequest } from '@/services/staff.service'
import { getAiOverview, setConversationMode } from '@/services/ai-console.service'

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(request: Request, ctx: Ctx) {
  try {
    const staff = requireSupervisorRole(await staffFromRequest(request))
    const { id } = await ctx.params
    const body = await readJson<{ mode?: unknown }>(request)
    await setConversationMode(staff, id, body.mode)
    return jsonOk({ overview: await getAiOverview() })
  } catch (err) {
    return jsonErr(err, 'Failed to update the conversation.')
  }
}
