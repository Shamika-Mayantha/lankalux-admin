import { jsonErr, jsonOk, requireAdmin } from '@/app/api/v2/_guard'
import { deleteExpense } from '@/services/finance.service'

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin(request)
    const { id } = await params
    await deleteExpense(id)
    return jsonOk({})
  } catch (err) {
    return jsonErr(err, 'Failed to delete expense.')
  }
}
