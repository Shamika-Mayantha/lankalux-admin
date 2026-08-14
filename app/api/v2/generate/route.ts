import { jsonErr, jsonOk, readJson, requireAdmin } from '@/app/api/v2/_guard'
import { generateOneItinerary } from '@/services/ai.service'
import { getRequest } from '@/services/request.service'
import { styleFromNumber, type ItineraryStyle } from '@/config/status'

export const maxDuration = 60

export async function POST(request: Request) {
  try {
    const user = await requireAdmin(request)
    const body = await readJson<{ requestId?: string; itineraryNumber?: number; style?: ItineraryStyle }>(request)
    const requestId = body.requestId
    const n = body.itineraryNumber
    if (!requestId) return jsonErr(new Error('Request ID is required'), 'Request ID is required')
    if (n !== 1 && n !== 2 && n !== 3) {
      return jsonErr(new Error('itineraryNumber must be 1, 2 or 3'))
    }
    const style = body.style || styleFromNumber(n)
    const row = await getRequest(requestId)
    const payload = await generateOneItinerary({
      request: row,
      optionNumber: n,
      style,
      actor: user.email,
    })
    return jsonOk({ itineraryNumber: n, style, itinerary: payload })
  } catch (err) {
    return jsonErr(err, 'AI request failed.')
  }
}
