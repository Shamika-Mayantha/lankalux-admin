import { jsonErr, jsonOk, readJson, requireAdmin } from '@/app/api/v2/_guard'
import { sendJourneyEmail } from '@/services/email.service'

export const maxDuration = 30

export async function POST(request: Request) {
  try {
    const user = await requireAdmin(request)
    const body = await readJson<{
      requestId?: string
      introduction?: string
      includeHotels?: boolean
      includeItinerary?: boolean
      subject?: string
      to?: string
    }>(request)
    if (!body.requestId) return jsonErr(new Error('Request ID is required'))
    const result = await sendJourneyEmail({
      requestId: body.requestId,
      actor: user.email,
      introduction: body.introduction,
      includeHotels: body.includeHotels,
      includeItinerary: body.includeItinerary,
      subject: body.subject,
      to: body.to,
    })
    return jsonOk(result)
  } catch (err) {
    return jsonErr(err, 'Email send failed.')
  }
}
