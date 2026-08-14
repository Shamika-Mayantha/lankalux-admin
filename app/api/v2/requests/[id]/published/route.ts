import { jsonErr, jsonOk, requireAdmin } from '@/app/api/v2/_guard'
import { getPublishedItinerary } from '@/services/itinerary.service'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(request: Request, ctx: Ctx) {
  try {
    await requireAdmin(request)
    const { id } = await ctx.params
    const journey = await getPublishedItinerary(id)
    return jsonOk({ journey })
  } catch (err) {
    return jsonErr(err)
  }
}
