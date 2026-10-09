import { jsonErr, jsonOk, readJson } from '@/app/api/v2/_guard'
import { requireSupervisorRole, staffFromRequest, updateStaff } from '@/services/staff.service'

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(request: Request, ctx: Ctx) {
  try {
    const actor = requireSupervisorRole(await staffFromRequest(request))
    const { id } = await ctx.params
    const body = await readJson<{ full_name?: string; role?: string; active?: boolean; password?: string }>(request)
    const user = await updateStaff(id, body, actor)
    return jsonOk({ user })
  } catch (err) {
    return jsonErr(err, 'Failed to update team member.')
  }
}
