import { jsonErr, jsonOk, requireAdmin } from '@/app/api/v2/_guard'
import { buildFinanceReport, monthKey } from '@/services/finance.service'

export async function GET(request: Request) {
  try {
    await requireAdmin(request)
    const params = new URL(request.url).searchParams
    return jsonOk({ report: await buildFinanceReport(monthKey(params.get('month')), params.get('trip')) })
  } catch (err) {
    return jsonErr(err, 'Failed to load finance.')
  }
}
