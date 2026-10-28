import { jsonErr, jsonOk, readJson } from '@/app/api/v2/_guard'
import { requireSupervisorRole, staffFromRequest } from '@/services/staff.service'
import { askTelegramBot } from '@/services/claude-bots.service'

/** Asks the Telegram replies bot to check the content group now, instead of at its next scheduled run. */
export async function POST(request: Request) {
  try {
    const staff = requireSupervisorRole(await staffFromRequest(request))
    const body = await readJson<{ postUpdate?: unknown; note?: unknown }>(request)
    return jsonOk({ run: await askTelegramBot(staff, body) })
  } catch (err) {
    return jsonErr(err, 'Could not ask Claude.')
  }
}
