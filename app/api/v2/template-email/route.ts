import { jsonErr, jsonOk, readJson, requireRequestAccess } from '@/app/api/v2/_guard'
import { sendFollowUpTemplateEmail } from '@/services/email.service'

export const maxDuration = 30

export async function POST(request: Request) {
  try {
    const body = await readJson<{
      requestId?: string
      templateId?: string
      subject?: string
      body?: string
    }>(request)
    if (!body.requestId) return jsonErr(new Error('Request ID is required'))
    const user = await requireRequestAccess(request, body.requestId)
    if (!body.templateId) return jsonErr(new Error('Template ID is required'))
    const result = await sendFollowUpTemplateEmail({
      requestId: body.requestId,
      templateId: body.templateId,
      subject: body.subject,
      body: body.body,
      actor: user.email,
      sender: user,
    })
    return jsonOk(result)
  } catch (err) {
    return jsonErr(err, 'Follow-up email failed.')
  }
}
