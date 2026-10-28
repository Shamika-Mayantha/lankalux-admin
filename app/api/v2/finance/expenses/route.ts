import { jsonErr, jsonOk, readJson, requireAdmin } from '@/app/api/v2/_guard'
import { addExpense } from '@/services/finance.service'

export async function POST(request: Request) {
  try {
    const user = await requireAdmin(request)
    await addExpense(await readJson<Record<string, unknown>>(request), user.email)
    return jsonOk({}, 201)
  } catch (err) {
    return jsonErr(err, 'Failed to add expense.')
  }
}
