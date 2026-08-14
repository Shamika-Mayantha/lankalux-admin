import { jsonErr, jsonOk, readJson, requireAdmin } from '@/app/api/v2/_guard'
import { createRequest, listRequests } from '@/services/request.service'
import type { RequestInput } from '@/types/domain'

export async function GET(request: Request) {
  try {
    await requireAdmin(request)
    const rows = await listRequests()
    return jsonOk({ requests: rows })
  } catch (err) {
    return jsonErr(err, 'Supabase request failed.')
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAdmin(request)
    const body = await readJson<RequestInput>(request)
    const created = await createRequest(body, user.email)
    return jsonOk({ request: created }, 201)
  } catch (err) {
    return jsonErr(err, 'Failed to create request.')
  }
}
