import { jsonErr, jsonOk, readJson } from '@/app/api/v2/_guard'
import { requireSupervisorRole, staffFromRequest } from '@/services/staff.service'
import { removeAiPartner, setAiPartnerStatus } from '@/services/ai-partners.service'

type Ctx = { params: Promise<{ id: string }> }

/** Marks a partner replied or not a fit, or sends the site back to be read again. */
export async function PATCH(request: Request, ctx: Ctx) {
  try {
    const staff = requireSupervisorRole(await staffFromRequest(request))
    const { id } = await ctx.params
    const body = await readJson<{ status?: unknown }>(request)
    await setAiPartnerStatus(staff, id, body.status)
    return jsonOk({})
  } catch (err) {
    return jsonErr(err, 'Failed to update the partner.')
  }
}

/** Takes a site we have not written to off the list. */
export async function DELETE(request: Request, ctx: Ctx) {
  try {
    const staff = requireSupervisorRole(await staffFromRequest(request))
    const { id } = await ctx.params
    await removeAiPartner(staff, id)
    return jsonOk({})
  } catch (err) {
    return jsonErr(err, 'Failed to remove the partner.')
  }
}
