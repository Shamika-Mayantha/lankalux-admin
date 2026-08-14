import { jsonErr, jsonOk, readJson, requireAdmin } from '@/app/api/v2/_guard'
import { getRequest, restoreRequest, updateRequest } from '@/services/request.service'
import { listActivity } from '@/services/activity.service'
import { listGenerationLogs, listItineraries } from '@/services/itinerary.service'
import type { RequestInput } from '@/types/domain'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(request: Request, ctx: Ctx) {
  try {
    await requireAdmin(request)
    const { id } = await ctx.params
    const row = await getRequest(id)
    const itineraries = await listItineraries(id)
    const activity = await listActivity(id)
    const generations = await listGenerationLogs(id)
    return jsonOk({ request: row, itineraries, activity, generations })
  } catch (err) {
    return jsonErr(err)
  }
}

export async function PATCH(request: Request, ctx: Ctx) {
  try {
    const user = await requireAdmin(request)
    const { id } = await ctx.params
    const body = await readJson<Partial<RequestInput> & { restore?: boolean; cancellation_reason?: string | null }>(request)
    const updated = body.restore ? await restoreRequest(id, user.email) : await updateRequest(id, body, user.email)
    return jsonOk({ request: updated })
  } catch (err) {
    return jsonErr(err)
  }
}
