import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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

function isoDateFromUtcDate(d: Date) {
  if (isNaN(d.getTime())) return null
  // Use UTC to avoid local timezone shifts changing the date.
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
    .toISOString()
    .slice(0, 10)
}

function parseTravelDatesRange(display: string | null | undefined): { startDate: string | null; endDate: string | null } {
  if (!display || typeof display !== 'string') return { startDate: null, endDate: null }
  // Expected format from the frontend: "2 Jun 2026 – 10 Jun 2026"
  const monthMap: Record<string, number> = {
    Jan: 0,
    Feb: 1,
    Mar: 2,
    Apr: 3,
    May: 4,
    Jun: 5,
    Jul: 6,
    Aug: 7,
    Sep: 8,
    Oct: 9,
    Nov: 10,
    Dec: 11,
  }

  const re = /(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/g
  const matches = Array.from(display.matchAll(re))
  if (matches.length < 2) return { startDate: null, endDate: null }

  const m1 = matches[0]
  const m2 = matches[1]

  const day1 = parseInt(m1[1], 10)
  const mon1 = monthMap[m1[2]]
  const year1 = parseInt(m1[3], 10)

  const day2 = parseInt(m2[1], 10)
  const mon2 = monthMap[m2[2]]
  const year2 = parseInt(m2[3], 10)

  if (mon1 === undefined || mon2 === undefined) return { startDate: null, endDate: null }

  const d1 = new Date(Date.UTC(year1, mon1, day1))
  const d2 = new Date(Date.UTC(year2, mon2, day2))

  return { startDate: isoDateFromUtcDate(d1), endDate: isoDateFromUtcDate(d2) }
}

function parsePassengersSummary(display: string | null | undefined): { numberOfAdults: number | null; numberOfChildren: number | null } {
  if (!display || typeof display !== 'string') return { numberOfAdults: null, numberOfChildren: null }
  const adultsMatch = display.match(/(\d+)\s*adult/i)
  const childrenMatch = display.match(/(\d+)\s*child/i)

  const numberOfAdults = adultsMatch ? parseInt(adultsMatch[1], 10) : null
  const numberOfChildren = childrenMatch ? parseInt(childrenMatch[1], 10) : null

  return { numberOfAdults: Number.isFinite(numberOfAdults as any) ? numberOfAdults : null, numberOfChildren }
}

function parseKidsAgesDisplay(display: string | null | undefined): number[] | null {
  if (!display || typeof display !== 'string') return null
  const s = display.trim()
  if (!s || s.toLowerCase() === 'none') return null

  // Frontend labels are like: "Under 2", "2–5 years", "6–11 years"
  const values: number[] = []
  const parts = s.split(',').map((p) => p.trim()).filter(Boolean)
  parts.forEach((p) => {
    if (/under\s*2/i.test(p)) values.push(1)
    else if (/2\s*[–-]\s*5\s*years/i.test(p) || /2\s*[–-]\s*5/i.test(p)) values.push(3)
    else if (/6\s*[–-]\s*11\s*years/i.test(p) || /6\s*[–-]\s*11/i.test(p)) values.push(8)
  })

  return values.length > 0 ? values : null
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

async function generateNextRequestId(supabase: any): Promise<string> {
  try {
    // Fetch existing IDs and compute the highest numeric suffix.
    // Matches your admin UI format: req-id-001, req-id-002, ...
    const { data, error } = await supabase
      .from('Client Requests')
      .select('id')
      .order('created_at', { ascending: false })
      .limit(2000)

    if (error) throw error

    const idPattern = /^req-id-(\d+)$/
    const nums: number[] = []
    ;(data || []).forEach((row: { id: string }) => {
      const match = row.id && typeof row.id === 'string' ? row.id.match(idPattern) : null
      if (match) nums.push(parseInt(match[1], 10))
    })

    const maxNumber = nums.length ? Math.max(...nums) : 0
    const nextNumber = maxNumber + 1
    const paddedNumber = nextNumber.toString().padStart(3, '0')
    return `req-id-${paddedNumber}`
  } catch {
    // Safe fallback so the endpoint never hard-fails due to ID generation.
    return 'req-id-001'
  }
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

    // Prefer raw fields (sent by newer frontend). If missing, fall back to parsing formatted strings.
    let startDate = typeof body.startDate === 'string' ? body.startDate : null
    let endDate = typeof body.endDate === 'string' ? body.endDate : null

    let numberOfAdults = parseMaybeInt(body.numberOfAdults)
    let numberOfChildren = parseMaybeInt(body.numberOfChildren)

    let childrenAgesValues = Array.isArray(body.childrenAgesValues) ? body.childrenAgesValues : null
    let childrenAgesNumeric =
      childrenAgesValues
        ? childrenAgesValues
            .map((x: unknown) => parseMaybeInt(x))
            .filter((n: number | null): n is number => n !== null)
        : []

    const travelDatesDisplay = typeof body.travelDates === 'string' ? body.travelDates.trim() : ''
    const passengersDisplay = typeof body.passengers === 'string' ? body.passengers.trim() : ''
    const kidsAgesDisplay = typeof body.kidsAges === 'string' ? body.kidsAges.trim() : ''

    if (!startDate || !endDate) {
      const parsed = parseTravelDatesRange(travelDatesDisplay)
      if (!startDate) startDate = parsed.startDate
      if (!endDate) endDate = parsed.endDate
    }

    if (numberOfAdults == null || numberOfChildren == null) {
      const parsed = parsePassengersSummary(passengersDisplay)
      if (numberOfAdults == null) numberOfAdults = parsed.numberOfAdults
      if (numberOfChildren == null) numberOfChildren = parsed.numberOfChildren
    }

    if (!childrenAgesNumeric.length) {
      const parsedKids = parseKidsAgesDisplay(kidsAgesDisplay)
      childrenAgesNumeric = parsedKids ? parsedKids : []
    }

    const duration = computeInclusiveDurationDays(startDate, endDate)
    const childrenAgesJson = childrenAgesNumeric.length > 0 ? JSON.stringify(childrenAgesNumeric) : null

    const whatsappRaw = typeof body.whatsapp === 'string' ? body.whatsapp.trim() : ''
    const whatsapp = whatsappRaw ? whatsappRaw : null

    const needAirlineTickets = coerceNeedAirlineTickets(body.needAirlineTickets)
    const airlineFrom = typeof body.airlineFrom === 'string' ? body.airlineFrom.trim() : ''
    const airlineDates = typeof body.airlineDates === 'string' ? body.airlineDates.trim() : ''

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

    const requestId = await generateNextRequestId(supabase)

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

    const res = NextResponse.json({ success: true, requestId, idMode: 'sequential' }, { status: 200 })
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

