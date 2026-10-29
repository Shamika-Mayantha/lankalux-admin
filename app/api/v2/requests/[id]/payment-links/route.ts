import { jsonErr, jsonOk, readJson, requireRequestAccess } from '@/app/api/v2/_guard'
import { createPaymentLink, listPaymentLinks } from '@/services/payment-link.service'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(request: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params
    await requireRequestAccess(request, id)
    return jsonOk({ links: await listPaymentLinks(id) })
  } catch (err) {
    return jsonErr(err, 'Could not load payment links.')
  }
}

export async function POST(request: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params
    const staff = await requireRequestAccess(request, id)
    const body = await readJson<Record<string, unknown>>(request)
    const link = await createPaymentLink(id, body, staff.email)
    return jsonOk({ link }, 201)
  } catch (err) {
    return jsonErr(err, 'Could not create the payment link.')
  }
}
