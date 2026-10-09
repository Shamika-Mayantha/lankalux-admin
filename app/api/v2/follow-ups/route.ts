import { jsonErr, jsonOk, requireStaff } from '@/app/api/v2/_guard'
import { CHASE_AFTER_DAYS, CHASE_TEMPLATE_ID, listFollowUps, REPLY_AFTER_HOURS } from '@/services/follow-up.service'

export async function GET(request: Request) {
  try {
    const staff = await requireStaff(request)
    const items = await listFollowUps(staff)
    return jsonOk({ items, replyAfterHours: REPLY_AFTER_HOURS, chaseAfterDays: CHASE_AFTER_DAYS, chaseTemplateId: CHASE_TEMPLATE_ID })
  } catch (err) {
    return jsonErr(err, 'Could not load follow-ups.')
  }
}
