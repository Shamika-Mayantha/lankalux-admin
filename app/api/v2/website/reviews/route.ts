import { jsonErr, jsonOk, readJson, requireAdmin } from '@/app/api/v2/_guard'
import { createReview, listReviews } from '@/services/website-content.service'

export async function GET(request: Request) {
  try {
    await requireAdmin(request)
    return jsonOk({ reviews: await listReviews() })
  } catch (err) {
    return jsonErr(err, 'Could not load reviews.')
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin(request)
    const body = await readJson<Record<string, unknown>>(request)
    return jsonOk({ review: await createReview(body) }, 201)
  } catch (err) {
    return jsonErr(err, 'Could not save the review.')
  }
}
