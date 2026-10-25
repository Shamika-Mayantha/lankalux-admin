import { jsonErr, jsonOk } from '@/app/api/v2/_guard'
import { requireSupervisorRole, staffFromRequest } from '@/services/staff.service'
import { addAiPartners, listAiPartners } from '@/services/ai-partners.service'

/** The travel businesses the Partner agent may introduce LankaLux to. */
export async function GET(request: Request) {
  try {
    requireSupervisorRole(await staffFromRequest(request))
    return jsonOk({ partners: await listAiPartners() })
  } catch (err) {
    return jsonErr(err, 'Failed to load partners.')
  }
}

/** { websites: "one per line" } */
export async function POST(request: Request) {
  try {
    const staff = requireSupervisorRole(await staffFromRequest(request))
    const body = (await request.json().catch(() => ({}))) as { websites?: unknown }
    return jsonOk(await addAiPartners(staff, body.websites))
  } catch (err) {
    return jsonErr(err, 'Failed to add websites.')
  }
}
