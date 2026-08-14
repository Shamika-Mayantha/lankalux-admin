import { jsonErr, jsonOk, requireAdmin } from '@/app/api/v2/_guard'
import { listVehicles } from '@/services/catalog.service'

export async function GET(request: Request) {
  try {
    await requireAdmin(request)
    const vehicles = await listVehicles()
    return jsonOk({ vehicles })
  } catch (err) {
    return jsonErr(err)
  }
}
