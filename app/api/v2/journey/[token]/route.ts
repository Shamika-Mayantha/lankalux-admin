import { NextResponse } from 'next/server'
import { getClientItinerary } from '@/services/itinerary.service'
import { jsonErr } from '@/app/api/v2/_guard'

type Ctx = { params: Promise<{ token: string }> }

export async function GET(_request: Request, ctx: Ctx) {
  try {
    const { token } = await ctx.params
    const journey = await getClientItinerary(token)
    return NextResponse.json({ success: true, journey })
  } catch (err) {
    return jsonErr(err, 'Journey not found.')
  }
}
