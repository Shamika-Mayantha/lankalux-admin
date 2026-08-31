import { jsonErr, jsonOk, requireAdmin } from '@/app/api/v2/_guard'
import { listDrivers } from '@/services/catalog.service'

export async function GET(request: Request) {
  try {
    await requireAdmin(request)
    const drivers = await listDrivers()
    return jsonOk({ drivers })
  } catch (err) {
    return jsonErr(err)
  }
}
