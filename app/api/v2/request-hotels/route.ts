import { jsonErr, jsonOk, readJson, requireAdmin } from '@/app/api/v2/_guard'
import { attachHotel } from '@/services/catalog.service'

export async function POST(request: Request) {
  try {
    const user = await requireAdmin(request)
    const body = await readJson<{ requestId?: string; hotelId?: string }>(request)
    if (!body.requestId || !body.hotelId) return jsonErr(new Error('requestId and hotelId are required'))
    await attachHotel(body.requestId, body.hotelId, user.email)
    return jsonOk({ attached: true })
  } catch (err) {
    return jsonErr(err)
  }
}
