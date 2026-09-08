import { jsonErr, jsonOk, readJson, requireAdmin } from '@/app/api/v2/_guard'
import { attachHotel, detachRequestHotel, listRequestHotels } from '@/services/catalog.service'
import { applyHotelsToRequestItineraries } from '@/services/itinerary.service'

export async function GET(request: Request) {
  try {
    await requireAdmin(request)
    const requestId = new URL(request.url).searchParams.get('requestId')
    if (!requestId) return jsonErr(new Error('requestId is required'))
    const hotels = await listRequestHotels(requestId)
    return jsonOk({ hotels })
  } catch (err) {
    return jsonErr(err)
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAdmin(request)
    const body = await readJson<{ requestId?: string; hotelId?: string; action?: 'attach' | 'apply' }>(request)
    if (!body.requestId) return jsonErr(new Error('requestId is required'))
    if (body.action === 'apply') {
      const result = await applyHotelsToRequestItineraries(body.requestId, user.email)
      return jsonOk({ applied: true, matchCount: result.matchCount })
    }
    if (!body.hotelId) return jsonErr(new Error('requestId and hotelId are required'))
    await attachHotel(body.requestId, body.hotelId, user.email)
    const hotels = await listRequestHotels(body.requestId)
    return jsonOk({ attached: true, hotels })
  } catch (err) {
    return jsonErr(err)
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireAdmin(request)
    const url = new URL(request.url)
    const requestId = url.searchParams.get('requestId')
    const attachmentId = url.searchParams.get('attachmentId')
    if (!requestId || !attachmentId) return jsonErr(new Error('requestId and attachmentId are required'))
    await detachRequestHotel(requestId, attachmentId, user.email)
    const hotels = await listRequestHotels(requestId)
    return jsonOk({ removed: true, hotels })
  } catch (err) {
    return jsonErr(err)
  }
}
