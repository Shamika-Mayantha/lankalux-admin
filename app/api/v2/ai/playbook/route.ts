import { jsonErr, jsonOk, readJson } from '@/app/api/v2/_guard'
import { requireSupervisorRole, staffFromRequest } from '@/services/staff.service'
import { getAiPlaybook, updateAiPlaybook } from '@/services/ai-console.service'

export async function GET(request: Request) {
  try {
    requireSupervisorRole(await staffFromRequest(request))
    return jsonOk({ playbook: await getAiPlaybook() })
  } catch (err) {
    return jsonErr(err, 'Failed to load the playbook.')
  }
}

export async function PUT(request: Request) {
  try {
    const staff = requireSupervisorRole(await staffFromRequest(request))
    const body = await readJson<{ playbook?: unknown }>(request)
    return jsonOk({ playbook: await updateAiPlaybook(staff, body.playbook) })
  } catch (err) {
    return jsonErr(err, 'Failed to save the playbook.')
  }
}
