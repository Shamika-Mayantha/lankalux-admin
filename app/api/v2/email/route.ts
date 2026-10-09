import { jsonErr, jsonOk, readJson, requireRequestAccess } from '@/app/api/v2/_guard'
import { previewJourneyEmail, sendJourneyEmail } from '@/services/email.service'

export const maxDuration = 30

export async function POST(request: Request) {
  try {
    const body = await readJson<{
      requestId?: string
      introduction?: string
      includeHotels?: boolean
      includeVehicle?: boolean
      vehicle?: { id: string; name: string; description: string; photos: string[] } | null
      includeItinerary?: boolean
      includePrice?: boolean
      price?: string | null
      subject?: string
      to?: string
      preview?: boolean
    }>(request)
    if (!body.requestId) return jsonErr(new Error('Request ID is required'))
    const user = await requireRequestAccess(request, body.requestId)
    const payload = {
      requestId: body.requestId,
      actor: user.email,
      introduction: body.introduction,
      includeHotels: body.includeHotels,
      includeVehicle: body.includeVehicle,
      vehicle: body.vehicle,
      includeItinerary: body.includeItinerary,
      includePrice: body.includePrice,
      price: body.price,
      subject: body.subject,
      to: body.to,
    }
    if (body.preview) {
      const result = await previewJourneyEmail(payload)
      return jsonOk(result)
    }
    const result = await sendJourneyEmail(payload)
    return jsonOk(result)
  } catch (err) {
    return jsonErr(err, 'Email send failed.')
  }
}
