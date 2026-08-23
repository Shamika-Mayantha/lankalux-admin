import { jsonErr, jsonOk, readJson, requireAdmin } from '@/app/api/v2/_guard'
import { isSoldLikeStatus } from '@/config/status'
import { listActivity } from '@/services/activity.service'
import { publishSoldItinerary } from '@/services/companion-publish.service'
import { listGenerationLogs, listItineraries } from '@/services/itinerary.service'
import { getRequest, restoreRequest, updateRequest } from '@/services/request.service'
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
    const body = await readJson<
      Partial<RequestInput> & { restore?: boolean; cancellation_reason?: string | null; sold_option?: 1 | 2 | 3 }
    >(request)
    const updated = body.restore ? await restoreRequest(id, user.email) : await updateRequest(id, body, user.email)
    let companion: Awaited<ReturnType<typeof publishSoldItinerary>> | null = null
    if (!body.restore && (body.sold_option || isSoldLikeStatus(body.status))) {
      companion = await publishSoldItinerary(id, body.sold_option, user.email)
    }
    return jsonOk({ request: await getRequest(id), companion })
  } catch (err) {
    return jsonErr(err)
  }
}
