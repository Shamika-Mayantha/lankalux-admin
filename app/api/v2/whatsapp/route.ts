import { jsonErr, jsonOk, readJson, requireAdmin } from '@/app/api/v2/_guard'
import { prepareWhatsApp } from '@/services/whatsapp.service'

export async function POST(request: Request) {
  try {
    const user = await requireAdmin(request)
    const body = await readJson<{ requestId?: string; includePrice?: boolean; price?: string | null }>(request)
    if (!body.requestId) return jsonErr(new Error('Request ID is required'))
    const result = await prepareWhatsApp({
      requestId: body.requestId,
      actor: user.email,
      includePrice: body.includePrice,
      price: body.price,
    })
    return jsonOk(result)
  } catch (err) {
    return jsonErr(err, 'WhatsApp prepare failed.')
  }
}
