import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

function computeInclusiveDurationDays(startDate: string | null, endDate: string | null) {
  if (!startDate || !endDate) return null
  const start = new Date(startDate + 'T00:00:00Z')
  const end = new Date(endDate + 'T00:00:00Z')
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return null
  const diffMs = Math.abs(end.getTime() - start.getTime())
  // Inclusive: same day -> 1 day
  return Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1
}

function parseMaybeInt(v: unknown) {
  if (v === null || v === undefined) return null
  const n = parseInt(String(v), 10)
  return Number.isFinite(n) && !isNaN(n) ? n : null
}

function coerceNeedAirlineTickets(v: unknown) {
  if (typeof v === 'boolean') return v
  const s = String(v || '').trim().toLowerCase()
  return s === 'yes' || s === 'true' || s === '1' || s === 'y'
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as any

    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const email = typeof body.email === 'string' ? body.email.trim() : ''
    if (!name || !email) {
      const res = NextResponse.json({ success: false, error: 'name and email are required' }, { status: 400 })
      Object.entries(corsHeaders).forEach(([k, v]) => res.headers.set(k, v))
      return res
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !supabaseServiceKey) {
      const res = NextResponse.json({ success: false, error: 'Server configuration error' }, { status: 500 })
      Object.entries(corsHeaders).forEach(([k, v]) => res.headers.set(k, v))
      return res
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const startDate = typeof body.startDate === 'string' ? body.startDate : null
    const endDate = typeof body.endDate === 'string' ? body.endDate : null
    const duration = computeInclusiveDurationDays(startDate, endDate)

    const numberOfAdults = parseMaybeInt(body.numberOfAdults)
    const numberOfChildren = parseMaybeInt(body.numberOfChildren)

    const childrenAgesValues = Array.isArray(body.childrenAgesValues) ? body.childrenAgesValues : null
    const childrenAgesNumeric =
      childrenAgesValues
        ? childrenAgesValues
            .map((x: unknown) => parseMaybeInt(x))
            .filter((n: number | null): n is number => n !== null)
        : []

    const childrenAgesJson = childrenAgesNumeric.length > 0 ? JSON.stringify(childrenAgesNumeric) : null

    const whatsappRaw = typeof body.whatsapp === 'string' ? body.whatsapp.trim() : ''
    const whatsapp = whatsappRaw ? whatsappRaw : null

    const needAirlineTickets = coerceNeedAirlineTickets(body.needAirlineTickets)
    const airlineFrom = typeof body.airlineFrom === 'string' ? body.airlineFrom.trim() : ''
    const airlineDates = typeof body.airlineDates === 'string' ? body.airlineDates.trim() : ''

    const travelDatesDisplay = typeof body.travelDates === 'string' ? body.travelDates.trim() : ''
    const passengersDisplay = typeof body.passengers === 'string' ? body.passengers.trim() : ''
    const kidsAgesDisplay = typeof body.kidsAges === 'string' ? body.kidsAges.trim() : ''

    const baseMessage = typeof body.message === 'string' ? body.message.trim() : ''
    const metaLines = [
      travelDatesDisplay ? `Travel dates: ${travelDatesDisplay}` : null,
      passengersDisplay ? `Passengers: ${passengersDisplay}` : null,
      kidsAgesDisplay ? `Kids ages (as selected): ${kidsAgesDisplay}` : null,
    ].filter(Boolean) as string[]
    const metaBlock = metaLines.length > 0 ? metaLines.join('\n') : ''
    const airlineBlock =
      needAirlineTickets
        ? `Need airline tickets: Yes\nFlying from: ${airlineFrom || 'N/A'}\nFlight dates: ${airlineDates || 'N/A'}`
        : 'Need airline tickets: No'

    const additionalPreferences = [baseMessage, metaBlock, airlineBlock].filter(Boolean).join('\n\n') || null

    const requestId = `req-${randomUUID().slice(0, 8)}`

    const { error } = await supabase.from('Client Requests').insert([
      {
        id: requestId,
        client_name: name,
        email,
        whatsapp,
        start_date: startDate,
        end_date: endDate,
        duration,
        origin_country: null,
        number_of_adults: numberOfAdults,
        number_of_children: numberOfChildren,
        children_ages: childrenAgesJson,
        additional_preferences: additionalPreferences,
        status: 'new',
      },
    ])

    if (error) {
      const res = NextResponse.json({ success: false, error: error.message || 'Failed to create request' }, { status: 500 })
      Object.entries(corsHeaders).forEach(([k, v]) => res.headers.set(k, v))
      return res
    }

    const res = NextResponse.json({ success: true, requestId }, { status: 200 })
    Object.entries(corsHeaders).forEach(([k, v]) => res.headers.set(k, v))
    return res
  } catch (err) {
    const res = NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
    Object.entries(corsHeaders).forEach(([k, v]) => res.headers.set(k, v))
    return res
  }
}

export async function OPTIONS() {
  // Handle CORS preflight for browser fetch() calls
  return new NextResponse(null, { status: 204, headers: corsHeaders })
}

