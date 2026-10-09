import { jsonErr, jsonOk, readJson, requireAdmin } from '@/app/api/v2/_guard'
import { deleteReview, updateReview } from '@/services/website-content.service'

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(request: Request, { params }: Ctx) {
  try {
    await requireAdmin(request)
    const { id } = await params
    const body = await readJson<Record<string, unknown>>(request)
    return jsonOk({ review: await updateReview(id, body) })
  } catch (err) {
    return jsonErr(err, 'Could not update the review.')
  }
}

export async function DELETE(request: Request, { params }: Ctx) {
  try {
    await requireAdmin(request)
    const { id } = await params
    await deleteReview(id)
    return jsonOk({ deleted: true })
  } catch (err) {
    return jsonErr(err, 'Could not delete the review.')
  }
}
