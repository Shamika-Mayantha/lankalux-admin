import { jsonErr, jsonOk, requireAdmin } from '@/app/api/v2/_guard'
import { buildPerformanceReport, PERFORMANCE_RANGES, type PerformanceRange } from '@/services/performance.service'

export async function GET(request: Request) {
  try {
    await requireAdmin(request)
    const asked = new URL(request.url).searchParams.get('range')
    const range = (PERFORMANCE_RANGES as readonly string[]).includes(asked || '') ? (asked as PerformanceRange) : 'week'
    return jsonOk({ report: await buildPerformanceReport(range) })
  } catch (err) {
    return jsonErr(err, 'Failed to load performance.')
  }
}
