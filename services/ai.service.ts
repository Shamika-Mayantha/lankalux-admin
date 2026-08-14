import OpenAI from 'openai'
import { openaiModel, requireOpenAiKey } from '@/config/env'
import { PROMPT_VERSION, STYLE_META, type ItineraryStyle } from '@/config/status'
import { inclusiveDuration, parseChildrenAges } from '@/services/request.service'
import { AppError } from '@/services/supabase.server'
import type { ClientRequestRow, StructuredItinerary } from '@/types/domain'
import { extractJsonObject } from '@/validation/itinerary.schema'
import { saveGeneratedOption, saveGenerationLog, toStructured, markOptionFailed } from '@/services/itinerary.service'

const STYLE_INSTRUCTIONS: Record<ItineraryStyle, string> = {
  balanced:
    'Create the RECOMMENDED, well-paced itinerary. Mix culture, scenery and rest in equal measure. This is the default proposal LankaLux would proudly send.',
  relaxed:
    'Create a RELAXED, comfort-focused itinerary. Fewer hotel changes, later starts, spa and beach time, scenic rather than strenuous days. Still cover the requested route without rushing.',
  experience:
    'Create an EXPERIENCE / EXPLORATION itinerary. Lean into wildlife, walking, trains, local food and distinctive places. Keep driving realistic — never sacrifice sleep for sightseeing.',
}

function formatDate(iso: string | null) {
  if (!iso) return 'Not specified'
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

function buildPrompt(request: ClientRequestRow, style: ItineraryStyle, expectedDays: number) {
  const ages = parseChildrenAges(request.children_ages)
  const childLine =
    (request.number_of_children || 0) > 0
      ? `${request.number_of_children} child${(request.number_of_children || 0) > 1 ? 'ren' : ''}${ages.length ? ` aged ${ages.join(', ')}` : ''}`
      : 'no children'
  const meta = STYLE_META[style]

  return `You are a luxury travel designer for LankaLux, a Sri Lankan tailor-made journey company.

Write ONE itinerary only — ${meta.label}: ${meta.subtitle}.
${STYLE_INSTRUCTIONS[style]}

CLIENT
- Name: ${request.client_name || 'Guest'}
- Country: ${request.origin_country || 'Not specified'}
- Dates: ${formatDate(request.start_date)} to ${formatDate(request.end_date)}
- Duration: EXACTLY ${expectedDays} days (inclusive)
- Party: ${request.number_of_adults || 0} adults, ${childLine}
- Destinations requested: ${request.requested_destinations || 'Plan a classic Sri Lanka flow'}
- Interests: ${request.interests || request.additional_preferences || 'None specified'}
- Hotel preference: ${request.hotel_preference || 'Not specified'}
- Vehicle preference: ${request.vehicle_preference || 'Not specified'}
- Budget: ${request.budget || 'Not specified'}
- Special requirements: ${request.special_requirements || 'None'}
- Additional notes: ${request.additional_preferences || 'None'}
- Arrival flight: ${request.arrival_flight || 'Not specified'}
- Departure flight: ${request.departure_flight || 'Not specified'}

HARD RULES
- Return ONLY JSON. No markdown.
- The "days" array MUST contain exactly ${expectedDays} objects, day 1 = start date, last day = end date.
- Geographic flow in ONE direction. No backtracking (do not go north then south then north).
- At most one major location transfer per day.
- Do not invent hotels that must be booked; describe overnight towns only.
- Activities are timed strings: "09:00 - Description".
- Do NOT include image URLs. The server maps photographs.

JSON SHAPE
{
  "title": "",
  "summary": "",
  "duration": "${expectedDays} days",
  "days": [
    {
      "day": 1,
      "date": "",
      "location": "",
      "overnight_location": "",
      "title": "",
      "description": "",
      "activities": [],
      "optional_activities": [],
      "travel": { "from": "", "to": "", "estimated_distance": "", "estimated_duration": "" }
    }
  ]
}`
}

function openaiMessage(err: unknown): string {
  const anyErr = err as { status?: number; code?: string; message?: string; error?: { message?: string; code?: string } }
  const code = anyErr?.code || anyErr?.error?.code || ''
  const msg = anyErr?.error?.message || anyErr?.message || ''
  if (anyErr?.status === 429 || code === 'rate_limit_exceeded') {
    return 'AI request failed: rate limit exceeded.'
  }
  if (anyErr?.status === 401 || code === 'invalid_api_key') {
    return 'AI request failed: OpenAI returned 401 (invalid API key).'
  }
  if (msg) return `AI request failed: ${msg}`
  return 'AI request failed.'
}

export async function generateOneItinerary(opts: {
  request: ClientRequestRow
  optionNumber: 1 | 2 | 3
  style: ItineraryStyle
  actor?: string
  retryCount?: number
}): Promise<StructuredItinerary> {
  const key = requireOpenAiKey()
  const model = openaiModel()
  const expectedDays =
    inclusiveDuration(opts.request.start_date, opts.request.end_date) || opts.request.duration || 7
  const openai = new OpenAI({ apiKey: key })
  let raw = ''

  try {
    const completion = await openai.chat.completions.create({
      model,
      temperature: opts.style === 'experience' ? 0.9 : 0.7,
      max_tokens: Math.min(Math.max(expectedDays * 700, 3500), 12000),
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'You design LankaLux itineraries. Reply with a single valid JSON object matching the requested schema. Never wrap in markdown.',
        },
        { role: 'user', content: buildPrompt(opts.request, opts.style, expectedDays) },
      ],
    })
    raw = completion.choices[0]?.message?.content?.trim() || ''
    if (completion.choices[0]?.finish_reason === 'length') {
      throw new AppError('Unable to parse generated itinerary. The model response was truncated. Try again.', 502)
    }
    if (!raw) throw new AppError('AI request failed: empty response.', 502)

    const json = extractJsonObject(raw)
    const payload = toStructured(json, opts.request.start_date)
    if (payload.days.length !== expectedDays) {
      throw new AppError(
        `Unable to parse generated itinerary. Expected ${expectedDays} days but received ${payload.days.length}.`,
        422
      )
    }

    const saved = await saveGeneratedOption({
      requestId: opts.request.id,
      optionNumber: opts.optionNumber,
      payload,
      model,
      actor: opts.actor,
    })
    await saveGenerationLog({
      request_id: opts.request.id,
      itinerary_id: saved.id.startsWith('legacy-') || saved.id.startsWith('placeholder-') ? null : saved.id,
      itinerary_number: opts.optionNumber,
      prompt_version: PROMPT_VERSION,
      model,
      success: true,
      raw_response: raw.slice(0, 20000),
      parsed_response: payload,
      retry_count: opts.retryCount || 0,
    })
    return payload
  } catch (err) {
    const message = err instanceof AppError ? err.message : openaiMessage(err)
    await markOptionFailed(opts.request.id, opts.optionNumber, message)
    await saveGenerationLog({
      request_id: opts.request.id,
      itinerary_number: opts.optionNumber,
      prompt_version: PROMPT_VERSION,
      model,
      success: false,
      error: message,
      raw_response: raw ? raw.slice(0, 20000) : null,
      retry_count: opts.retryCount || 0,
    })
    throw err instanceof AppError ? err : new AppError(message, 502)
  }
}
