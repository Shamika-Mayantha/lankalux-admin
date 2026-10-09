import { jsonErr, jsonOk, readJson, requireRequestAccess } from '@/app/api/v2/_guard'
import { listRequestEmails, sendReplyEmail } from '@/services/email.service'
import { senderFor } from '@/services/mailer'

export const maxDuration = 30

type Ctx = { params: Promise<{ id: string }> }

/** The request's email conversation. Agents only reach requests they may see. */
export async function GET(request: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params
    const staff = await requireRequestAccess(request, id)
    const emails = await listRequestEmails(id)
    return jsonOk({ emails, sendingAs: senderFor(staff).address })
  } catch (err) {
    return jsonErr(err)
  }
}

export async function POST(request: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params
    const staff = await requireRequestAccess(request, id)
    const body = await readJson<{ body?: string; subject?: string }>(request)
    const result = await sendReplyEmail({ requestId: id, body: body.body || '', subject: body.subject, sender: staff })
    return jsonOk(result)
  } catch (err) {
    return jsonErr(err, 'Email send failed.')
  }
}
