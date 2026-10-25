import { jsonErr, jsonOk } from '@/app/api/v2/_guard'
import { requireSupervisorRole, staffFromRequest } from '@/services/staff.service'
import { listAiLeads } from '@/services/ai-leads.service'

/** The Lead Scout's finds. ?view=all shows every lead it has read, handled ones included. */
export async function GET(request: Request) {
  try {
    requireSupervisorRole(await staffFromRequest(request))
    const view = new URL(request.url).searchParams.get('view')
    return jsonOk(await listAiLeads(view))
  } catch (err) {
    return jsonErr(err, 'Failed to load leads.')
  }
}
