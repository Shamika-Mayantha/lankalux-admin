import { jsonErr, jsonOk, readJson, requireAdmin } from '@/app/api/v2/_guard'
import { createPromotion, listPromotions } from '@/services/website-content.service'

export async function GET(request: Request) {
  try {
    await requireAdmin(request)
    return jsonOk({ promotions: await listPromotions() })
  } catch (err) {
    return jsonErr(err, 'Could not load promotions.')
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin(request)
    const body = await readJson<Record<string, unknown>>(request)
    return jsonOk({ promotion: await createPromotion(body) }, 201)
  } catch (err) {
    return jsonErr(err, 'Could not save the promotion.')
  }
}
