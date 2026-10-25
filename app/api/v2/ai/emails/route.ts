import { jsonErr, jsonOk } from '@/app/api/v2/_guard'
import { requireSupervisorRole, staffFromRequest } from '@/services/staff.service'
import { listAiEmails } from '@/services/ai-leads.service'

/** Every email the AI wrote, sent or not, in full. */
export async function GET(request: Request) {
  try {
    requireSupervisorRole(await staffFromRequest(request))
    return jsonOk({ emails: await listAiEmails() })
  } catch (err) {
    return jsonErr(err, 'Failed to load emails.')
  }
}
