import { jsonErr, jsonOk, readJson, requireStaff } from '@/app/api/v2/_guard'
import { changeOwnPassword } from '@/services/staff.service'

export async function POST(request: Request) {
  try {
    const staff = await requireStaff(request)
    const body = await readJson<{ currentPassword?: string; newPassword?: string }>(request)
    await changeOwnPassword(staff, body.currentPassword, body.newPassword)
    return jsonOk({ changed: true })
  } catch (err) {
    return jsonErr(err, 'Failed to change password.')
  }
}
