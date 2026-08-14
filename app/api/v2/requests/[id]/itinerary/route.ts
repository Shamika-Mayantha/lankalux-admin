import { jsonErr, jsonOk, readJson, requireAdmin } from '@/app/api/v2/_guard'
import { selectItinerary, updateItineraryDraft } from '@/services/itinerary.service'
import type { StructuredItinerary } from '@/types/domain'
import { AppError } from '@/services/supabase.server'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(request: Request, ctx: Ctx) {
  try {
    const user = await requireAdmin(request)
    const { id } = await ctx.params
    const body = await readJson<{
      action?: 'select' | 'save'
      optionNumber?: number
      payload?: StructuredItinerary
      vehicle_id?: string | null
      internal_notes?: string
    }>(request)
    const n = body.optionNumber
    if (n !== 1 && n !== 2 && n !== 3) throw new AppError('optionNumber must be 1, 2 or 3')

    if (body.action === 'select') {
      const selected = await selectItinerary(id, n, user.email)
      return jsonOk({ itinerary: selected })
    }
    if (body.action === 'save') {
      if (!body.payload) throw new AppError('payload is required')
      const saved = await updateItineraryDraft(id, n, body.payload, { vehicle_id: body.vehicle_id, internal_notes: body.internal_notes }, user.email)
      return jsonOk({ itinerary: saved })
    }
    throw new AppError('action must be select or save')
  } catch (err) {
    return jsonErr(err)
  }
}
