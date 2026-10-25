import { jsonErr, jsonOk, readJson } from '@/app/api/v2/_guard'
import { requireSupervisorRole, staffFromRequest } from '@/services/staff.service'
import { convertAiLead, setAiLeadStatus } from '@/services/ai-leads.service'

type Ctx = { params: Promise<{ id: string }> }

/** Marks a lead replied or not relevant (or back to new). */
export async function PATCH(request: Request, ctx: Ctx) {
  try {
    const staff = requireSupervisorRole(await staffFromRequest(request))
    const { id } = await ctx.params
    const body = await readJson<{ status?: unknown }>(request)
    await setAiLeadStatus(staff, id, body.status)
    return jsonOk({})
  } catch (err) {
    return jsonErr(err, 'Failed to update the lead.')
  }
}

/** Creates a Client Request from the lead. */
export async function POST(request: Request, ctx: Ctx) {
  try {
    const staff = requireSupervisorRole(await staffFromRequest(request))
    const { id } = await ctx.params
    const body = await readJson<{ name?: unknown; email?: unknown; whatsapp?: unknown }>(request)
    return jsonOk({ request_id: await convertAiLead(staff, id, body) })
  } catch (err) {
    return jsonErr(err, 'Failed to create the request.')
  }
}
