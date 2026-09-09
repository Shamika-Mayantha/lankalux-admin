import { jsonErr, jsonOk, requireAdmin } from '@/app/api/v2/_guard'
import { getOrCreateShareLink } from '@/services/share.service'
import type { CanonicalJourney } from '@/types/domain'

type Ctx = { params: Promise<{ id: string }> }

type Body = {
  forceNew?: boolean
  includeHotels?: boolean
  includeVehicle?: boolean
  vehicle?: CanonicalJourney['vehicle']
  includePrice?: boolean
  price?: string | null
}

export async function POST(request: Request, ctx: Ctx) {
  try {
    const user = await requireAdmin(request)
    const { id } = await ctx.params
    let body: Body = {}
    try {
      body = (await request.json()) as Body
    } catch {
      body = {}
    }

    const hasSendOptions =
      body.includeVehicle !== undefined ||
      body.includePrice !== undefined ||
      body.vehicle !== undefined ||
      body.price !== undefined ||
      body.includeHotels !== undefined

    const share = await getOrCreateShareLink({
      requestId: id,
      actor: user.email,
      forceNew: !!body.forceNew,
      sendOptions: hasSendOptions
        ? {
            channel: 'preview',
            includeHotels: body.includeHotels,
            includeVehicle: body.includeVehicle,
            vehicle: body.vehicle,
            includePrice: body.includePrice,
            price: body.price,
          }
        : undefined,
    })

    return jsonOk({
      token: share.token,
      url: share.url,
      created: share.created,
    })
  } catch (err) {
    return jsonErr(err, 'Could not create itinerary link.')
  }
}
