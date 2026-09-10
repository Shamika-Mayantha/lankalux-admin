import OpenAI from 'openai'
import { openaiModel, requireOpenAiKey } from '@/config/env'
import { PROMPT_VERSION, type ItineraryStyle } from '@/config/status'
import { inclusiveDuration } from '@/services/request.service'
import { applyHotelsToDays } from '@/services/hotel-match.service'
import { buildItineraryPrompt } from '@/services/itinerary-prompt'
import { hotelsForRequest, saveGeneratedOption, saveGenerationLog, toStructured, markOptionFailed } from '@/services/itinerary.service'
import { AppError } from '@/services/supabase.server'
import type { ClientRequestRow, StructuredItinerary } from '@/types/domain'
import { extractJsonObject } from '@/validation/itinerary.schema'

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
  const hotels = await hotelsForRequest(opts.request.id)
  const openai = new OpenAI({ apiKey: key })
  let raw = ''

  try {
    const completion = await openai.chat.completions.create({
      model,
      temperature: opts.style === 'experience' ? 0.9 : 0.7,
      max_tokens: Math.min(Math.max(expectedDays * 950, 5000), 14000),
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'You design LankaLux itineraries. Reply with a single valid JSON object matching the requested schema. Never wrap in markdown. Every day must include at least 4 timed activities that match that day, including named en-route or nearby hidden places. Write in LankaLux voice — never copied from another operator.',
        },
        { role: 'user', content: buildItineraryPrompt(opts.request, opts.style, expectedDays, hotels) },
      ],
    })
    raw = completion.choices[0]?.message?.content?.trim() || ''
    if (completion.choices[0]?.finish_reason === 'length') {
      throw new AppError('Unable to parse generated itinerary. The model response was truncated. Try again.', 502)
    }
    if (!raw) throw new AppError('AI request failed: empty response.', 502)

    const json = extractJsonObject(raw)
    const generated = toStructured(json, opts.request.start_date)
    const applied = applyHotelsToDays(generated.days, hotels, { replace: true })
    const payload = { ...generated, days: applied.days }
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
