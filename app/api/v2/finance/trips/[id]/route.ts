import { jsonErr, jsonOk, readJson, requireAdmin } from '@/app/api/v2/_guard'
import { saveTripFinance } from '@/services/finance.service'

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAdmin(request)
    const { id } = await params
    await saveTripFinance(id, await readJson<Record<string, unknown>>(request), user.email)
    return jsonOk({})
  } catch (err) {
    return jsonErr(err, 'Failed to save trip money.')
  }
}
