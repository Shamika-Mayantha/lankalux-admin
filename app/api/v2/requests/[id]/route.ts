import { jsonErr, jsonOk, readJson, requireRequestAccess } from '@/app/api/v2/_guard'
import { normalizeStatus } from '@/config/status'
import { listActivity } from '@/services/activity.service'
import { publishSoldItinerary } from '@/services/companion-publish.service'
import { listRequestHotels } from '@/services/catalog.service'
import { listGenerationLogs, listItineraries } from '@/services/itinerary.service'
import { getRequest, restoreRequest, updateRequest } from '@/services/request.service'
import { AppError } from '@/services/supabase.server'
import { assertAssignable, isSupervisor } from '@/services/staff.service'
import type { RequestInput } from '@/types/domain'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(request: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params
    await requireRequestAccess(request, id)
    const row = await getRequest(id)
    const itineraries = await listItineraries(id)
    const activity = await listActivity(id)
    const generations = await listGenerationLogs(id)
    const hotels = await listRequestHotels(id)
    return jsonOk({ request: row, itineraries, activity, generations, hotels })
  } catch (err) {
    return jsonErr(err)
  }
}

export async function PATCH(request: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params
    const user = await requireRequestAccess(request, id)
    const body = await readJson<
      Partial<RequestInput> & {
        restore?: boolean
        cancellation_reason?: string | null
        sold_option?: 1 | 2 | 3
        sold_price?: string | null
      }
    >(request)
    if ('assigned_agent_id' in body && !isSupervisor(user)) {
      throw new AppError('Only a supervisor can assign requests.', 403)
    }
    if ('assigned_agent_id' in body) await assertAssignable(body.assigned_agent_id)
    const updated = body.restore ? await restoreRequest(id, user.email) : await updateRequest(id, body, user.email)
    if (!body.restore && normalizeStatus(updated.status) === 'sold') {
      await publishSoldItinerary(id, body.sold_option, user.email, body.sold_price)
    }
    return jsonOk({ request: await getRequest(id) })
  } catch (err) {
    return jsonErr(err)
  }
}
