import { jsonErr, jsonOk, readJson } from '@/app/api/v2/_guard'
import { requireSupervisorRole, staffFromRequest } from '@/services/staff.service'
import { decideAiAction, getAiOverview } from '@/services/ai-console.service'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(request: Request, ctx: Ctx) {
  try {
    const staff = requireSupervisorRole(await staffFromRequest(request))
    const { id } = await ctx.params
    const body = await readJson<{ decision?: unknown; note?: unknown; text?: unknown }>(request)
    const send = await decideAiAction(staff, id, body.decision, body.note, body.text)
    return jsonOk({ overview: await getAiOverview(), send })
  } catch (err) {
    return jsonErr(err, 'Failed to save the decision.')
  }
}
