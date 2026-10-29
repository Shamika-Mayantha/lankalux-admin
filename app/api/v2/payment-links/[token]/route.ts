import { AppError } from '@/services/supabase.server'
import { jsonErr, jsonOk, readJson, requireRequestAccess } from '@/app/api/v2/_guard'
import { cancelPaymentLink, markPaymentLinkPaid, paymentLinkRequestId } from '@/services/payment-link.service'

type Ctx = { params: Promise<{ token: string }> }

export async function PATCH(request: Request, ctx: Ctx) {
  try {
    const { token } = await ctx.params
    const staff = await requireRequestAccess(request, await paymentLinkRequestId(token))
    const body = await readJson<{ action?: string }>(request)
    if (body.action === 'paid') return jsonOk(await markPaymentLinkPaid(token, staff.email))
    if (body.action === 'cancel') return jsonOk({ link: await cancelPaymentLink(token, staff.email) })
    throw new AppError('Unknown action.', 400)
  } catch (err) {
    return jsonErr(err, 'Could not update the payment link.')
  }
}
