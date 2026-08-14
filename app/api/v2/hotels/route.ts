import { jsonErr, jsonOk, readJson, requireAdmin } from '@/app/api/v2/_guard'
import { listHotels, upsertHotel } from '@/services/catalog.service'
import type { HotelRecord } from '@/types/domain'

export async function GET(request: Request) {
  try {
    await requireAdmin(request)
    const hotels = await listHotels()
    return jsonOk({ hotels })
  } catch (err) {
    return jsonErr(err)
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin(request)
    const body = await readJson<Partial<HotelRecord> & { name: string; id?: string }>(request)
    if (!body.name?.trim()) return jsonErr(new Error('Hotel name is required'))
    const hotel = await upsertHotel(body, body.id)
    return jsonOk({ hotel })
  } catch (err) {
    return jsonErr(err)
  }
}
