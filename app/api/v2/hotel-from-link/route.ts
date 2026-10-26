import { jsonErr, jsonOk, readJson, requireStaff } from '@/app/api/v2/_guard'
import { hotelFromLink } from '@/services/hotel-link.service'
import { AppError } from '@/services/supabase.server'

export const maxDuration = 30

/** Paste a hotel link (Booking.com, Agoda, TripAdvisor, Google Maps, hotel site) and get its details back. */
export async function POST(request: Request) {
  try {
    await requireStaff(request)
    const body = await readJson<{ url?: string }>(request)
    if (!body.url?.trim()) return jsonErr(new AppError('Paste a hotel link first.', 400))
    const hotel = await hotelFromLink(body.url)
    return jsonOk({ hotel })
  } catch (err) {
    return jsonErr(err, 'Could not read that link. Please fill the details by hand.')
  }
}
