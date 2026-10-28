import { jsonErr, jsonOk, readJson, requireAdmin } from '@/app/api/v2/_guard'
import { deleteExpense, updateExpense } from '@/services/finance.service'

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(request: Request, { params }: Ctx) {
  try {
    await requireAdmin(request)
    const { id } = await params
    await updateExpense(id, await readJson<Record<string, unknown>>(request))
    return jsonOk({})
  } catch (err) {
    return jsonErr(err, 'Failed to save expense.')
  }
}

export async function DELETE(request: Request, { params }: Ctx) {
  try {
    await requireAdmin(request)
    const { id } = await params
    await deleteExpense(id)
    return jsonOk({})
  } catch (err) {
    return jsonErr(err, 'Failed to delete expense.')
  }
}
