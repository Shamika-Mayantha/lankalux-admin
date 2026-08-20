import { getInvoiceSettings, saveInvoiceSettings } from '@/services/invoice.service'
import { fail, ok, readJson, requireAdmin } from '@/app/api/invoices/_guard'

export async function GET(request: Request) {
  try {
    await requireAdmin(request)
    const settings = await getInvoiceSettings()
    return ok({ settings })
  } catch (error) {
    return fail(error)
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireAdmin(request)
    const patch = await readJson<{
      beneficiary_name?: string | null
      bank_name?: string | null
      account_number?: string | null
      branch_name?: string | null
      swift_code?: string | null
      iban?: string | null
      payment_reference_note?: string | null
      instructions_note?: string | null
      show_vehicle_registration?: boolean
      default_client_note?: string | null
      visible_fields?: Record<string, boolean>
    }>(request)
    const settings = await saveInvoiceSettings(patch, user.email || user.id)
    return ok({ settings })
  } catch (error) {
    return fail(error)
  }
}
