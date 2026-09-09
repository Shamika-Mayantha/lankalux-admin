import { jsonErr, jsonOk, readJson, requireAdmin } from '@/app/api/v2/_guard'
import { createPreviewShareLink } from '@/services/share.service'

export async function POST(request: Request) {
  try {
    const user = await requireAdmin(request)
    const body = await readJson<{ journey?: unknown } | null>(request)
    return jsonOk(await createPreviewShareLink({ journey: body?.journey, actor: user.email }))
  } catch (err) {
    return jsonErr(err, 'Unable to create preview link.')
  }
}
