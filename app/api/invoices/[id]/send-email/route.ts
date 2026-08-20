import { sendInvoiceEmail } from '@/services/email.service'
import { fail, ok, readJson, requireAdmin } from '@/app/api/invoices/_guard'

export const maxDuration = 30

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAdmin(request)
    const { id } = await params
    const body = await readJson<{ to?: string }>(request)
    const result = await sendInvoiceEmail({
      invoiceId: id,
      to: body.to,
      actor: user.email || user.id,
    })
    return ok({ message: `Email sent to ${result.to}.`, to: result.to, subject: result.subject })
  } catch (error) {
    return fail(error)
  }
}
