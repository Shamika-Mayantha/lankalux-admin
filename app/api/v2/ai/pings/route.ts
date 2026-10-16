import { jsonErr, jsonOk, readJson } from '@/app/api/v2/_guard'
import { requireSupervisorRole, staffFromRequest } from '@/services/staff.service'
import { getAiOverview, markPingsRead } from '@/services/ai-console.service'

/** Marks AI pings as seen: `{ ids: [...] }`, or `{}` for all of them. */
export async function POST(request: Request) {
  try {
    const staff = requireSupervisorRole(await staffFromRequest(request))
    const body = await readJson<{ ids?: unknown }>(request)
    await markPingsRead(staff, body.ids)
    return jsonOk({ overview: await getAiOverview() })
  } catch (err) {
    return jsonErr(err, 'Failed to update notifications.')
  }
}
