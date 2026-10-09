import { jsonErr, jsonOk, requireStaff } from '@/app/api/v2/_guard'

/** Who is signed in and what they may do; the console uses this to shape its navigation. */
export async function GET(request: Request) {
  try {
    const staff = await requireStaff(request)
    return jsonOk({ me: { id: staff.id, email: staff.email, name: staff.name, role: staff.role } })
  } catch (err) {
    return jsonErr(err)
  }
}
