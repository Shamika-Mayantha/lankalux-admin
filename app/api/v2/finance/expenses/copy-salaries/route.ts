import { jsonErr, jsonOk, readJson, requireAdmin } from '@/app/api/v2/_guard'
import { copySalaries, monthKey } from '@/services/finance.service'

export async function POST(request: Request) {
  try {
    const user = await requireAdmin(request)
    const body = await readJson<{ month?: string }>(request)
    return jsonOk({ copied: await copySalaries(monthKey(body.month), user.email) })
  } catch (err) {
    return jsonErr(err, 'Failed to copy salaries.')
  }
}
