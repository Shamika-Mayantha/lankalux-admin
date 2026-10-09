import { NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { mapWebsiteLead } from '@/lib/website-lead'
import { clientIp, isRateLimited } from '@/lib/rate-limit'
import { describeTrafficSource } from '@/lib/traffic-source'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

function withCors(res: NextResponse) {
  Object.entries(corsHeaders).forEach(([k, v]) => res.headers.set(k, v))
  return res
}

async function generateNextRequestId(supabase: SupabaseClient): Promise<string> {
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
}

const MAX_ID_ATTEMPTS = 5

function isDuplicateIdError(error: { code?: string; message?: string } | null) {
  return !!error && (error.code === '23505' || /duplicate key/i.test(error.message || ''))
}

const EXTRA_COLUMNS = [
  'interests',
  'lead_source',
  'special_requirements',
  'arrival_flight',
  'departure_flight',
  'requested_destinations',
  'vehicle_preference',
] as const

export async function POST(request: Request) {
  try {
    if (isRateLimited(`requests:${clientIp(request)}`, 10, 10 * 60 * 1000)) {
      return withCors(NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 }))
    }
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const lead = mapWebsiteLead(body)

    if (!lead.client_name || !lead.email) {
      return withCors(NextResponse.json({ success: false, error: 'name and email are required' }, { status: 400 }))
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !supabaseServiceKey) {
      return withCors(NextResponse.json({ success: false, error: 'Server configuration error' }, { status: 500 }))
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const payload: Record<string, unknown> = {
      client_name: lead.client_name,
      email: lead.email,
      whatsapp: lead.whatsapp,
      start_date: lead.start_date,
      end_date: lead.end_date,
      duration: lead.duration,
      origin_country: lead.origin_country,
      number_of_adults: lead.number_of_adults,
      number_of_children: lead.number_of_children,
      children_ages: lead.children_ages.length ? JSON.stringify(lead.children_ages) : null,
      additional_preferences: lead.additional_preferences,
      interests: lead.interests,
      special_requirements: lead.special_requirements,
      arrival_flight: lead.arrival_flight,
      departure_flight: lead.departure_flight,
      requested_destinations: lead.requested_destinations,
      vehicle_preference: lead.vehicle_preference,
      lead_source: lead.lead_source || 'Website',
      traffic_source: describeTrafficSource(body.attribution),
      status: 'new',
    }

    let requestId = ''
    let error: { code?: string; message?: string } | null = null
    let useLegacyColumns = false
    let useTrafficSource = true
    for (let attempt = 0; attempt < MAX_ID_ATTEMPTS; attempt++) {
      // Re-reading after a duplicate picks up the ID a concurrent enquiry just claimed.
      requestId = await generateNextRequestId(supabase)
      const row: Record<string, unknown> = { ...payload, id: requestId }
      if (useLegacyColumns) for (const key of EXTRA_COLUMNS) delete row[key]
      if (!useTrafficSource) delete row.traffic_source
      ;({ error } = await supabase.from('Client Requests').insert([row]))
      // Until the traffic_source column exists, save the enquiry without it.
      if (error && useTrafficSource && /traffic_source/i.test(error.message || '')) {
        useTrafficSource = false
        delete row.traffic_source
        ;({ error } = await supabase.from('Client Requests').insert([row]))
      }
      if (error && !useLegacyColumns && /schema cache|PGRST204|column/i.test(error.message || '')) {
        useLegacyColumns = true
        for (const key of EXTRA_COLUMNS) delete row[key]
        ;({ error } = await supabase.from('Client Requests').insert([row]))
      }
      if (!isDuplicateIdError(error)) break
    }

    if (error) {
      return withCors(
        NextResponse.json({ success: false, error: error.message || 'Failed to create request' }, { status: 500 })
      )
    }

    return withCors(NextResponse.json({ success: true, requestId, idMode: 'sequential' }, { status: 200 }))
  } catch (err) {
    return withCors(
      NextResponse.json(
        { success: false, error: err instanceof Error ? err.message : 'Unknown error' },
        { status: 500 }
      )
    )
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders })
}
