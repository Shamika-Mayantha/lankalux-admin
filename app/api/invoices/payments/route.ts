import { listPaymentsFeed } from '@/services/invoice.service'
import { fail, ok, requireAdmin } from '@/app/api/invoices/_guard'

export async function GET(request: Request) {
  try {
    await requireAdmin(request)
    const { searchParams } = new URL(request.url)
    const limitParam = Number(searchParams.get('limit') || 200)
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 500) : 200
    const payments = await listPaymentsFeed(limit)
    return ok({ payments })
  } catch (error) {
    return fail(error)
  }
}
