import OpenAI from 'openai'
import { openaiModel, requireOpenAiKey } from '@/config/env'
import { PROMPT_VERSION, type ItineraryStyle } from '@/config/status'
import { inclusiveDuration } from '@/services/request.service'
import { applyHotelsToDays } from '@/services/hotel-match.service'
import { buildItineraryPrompt } from '@/services/itinerary-prompt'
import { hotelsForRequest, listItineraries, saveGeneratedOption, saveGenerationLog, toStructured, markOptionFailed } from '@/services/itinerary.service'
import { AppError } from '@/services/supabase.server'
import type { ClientRequestRow, StructuredItinerary } from '@/types/domain'
import { extractJsonObject } from '@/validation/itinerary.schema'
import { NO_DASHES_RULE, undashDeep } from '@/lib/no-dashes'
import { checkRoute, fixDayOrder, routeFeedback } from '@/lib/route-order'
import { untimeDays } from '@/lib/untimed'

/** A second attempt only fits if the first one came back quickly (the route allows 90 seconds). */
const RETRY_BUDGET_MS = 40_000

/** Clock times out, stops in driving order. Works on the model's raw JSON before it is structured. */
function prepareDays(json: unknown) {
  const obj = (json && typeof json === 'object' ? json : {}) as { days?: unknown }
  if (!Array.isArray(obj.days)) return { json: obj, report: checkRoute([]) }
  const days = untimeDays(obj.days as Record<string, unknown>[]) as Parameters<typeof checkRoute>[0]
  const report = checkRoute(days)
  return { json: { ...obj, days: fixDayOrder(days) }, report }
}

/** Problems code cannot repair on its own: the overnight order itself doubles back. */
const needsRewrite = (report: ReturnType<typeof checkRoute>) =>
  report.issues.some((i) => i.kind === 'revisit' || i.kind === 'zigzag') ||
  report.issues.filter((i) => i.kind === 'off-route' || i.kind === 'far-day-trip').length >= 3

/** The other options' routes for this request, so this one reads as a real alternative. */
async function otherOptions(requestId: string, optionNumber: number) {
  try {
    const records = await listItineraries(requestId)
    return records
      .filter((r) => r.option_number !== optionNumber && r.payload?.days?.length)
      .map((r) => ({
        label: `Option ${r.option_number}`,
        title: r.title || r.payload.title,
        route: r.payload.days
          .map((d) => d.overnight_location || d.location)
          .filter((town, i, all) => town && town !== all[i - 1])
          .join(', '),
      }))
  } catch {
    return []
  }
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
  const hotels = await hotelsForRequest(opts.request.id)
  const others = await otherOptions(opts.request.id, opts.optionNumber)
  const openai = new OpenAI({ apiKey: key })
  let raw = ''
  const started = Date.now()

  try {
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content:
          'You design LankaLux itineraries. Reply with a single valid JSON object matching the requested schema. Never wrap in markdown. Every day must include at least 4 named activities that match that day, including named en-route or nearby places, listed in the order the car reaches them, with no clock times. The route sweeps one way and never doubles back. Write in LankaLux voice, never copied from another operator. ' + NO_DASHES_RULE,
      },
      { role: 'user', content: buildItineraryPrompt(opts.request, opts.style, expectedDays, hotels, others) },
    ]
    const complete = async () => {
      const completion = await openai.chat.completions.create({
        model,
        temperature: opts.style === 'experience' ? 0.9 : 0.7,
        max_tokens: Math.min(Math.max(expectedDays * 950, 5000), 14000),
        response_format: { type: 'json_object' },
        messages,
      })
      const text = completion.choices[0]?.message?.content?.trim() || ''
      if (completion.choices[0]?.finish_reason === 'length') {
        throw new AppError('Unable to parse generated itinerary. The model response was truncated. Try again.', 502)
      }
      if (!text) throw new AppError('AI request failed: empty response.', 502)
      return text
    }

    raw = await complete()
    let prepared = prepareDays(extractJsonObject(raw))
    if (needsRewrite(prepared.report) && Date.now() - started < RETRY_BUDGET_MS) {
      // One rewrite with the map check's notes. Keep whichever version doubles back less.
      messages.push({ role: 'assistant', content: raw }, { role: 'user', content: routeFeedback(prepared.report) })
      try {
        const retryRaw = await complete()
        const retried = prepareDays(extractJsonObject(retryRaw))
        const days = (p: typeof prepared) => ((p.json as { days?: unknown[] }).days || []).length
        if (retried.report.issues.length < prepared.report.issues.length && days(retried) === expectedDays) {
          prepared = retried
          raw = retryRaw
        }
      } catch (retryErr) {
        console.warn('Route rewrite failed, keeping the first version:', retryErr)
      }
    }
    if (!prepared.report.ok) {
      console.warn('Itinerary route notes:', prepared.report.issues.map((i) => i.message).join(' | '))
    }

    const generated = undashDeep(toStructured(prepared.json, opts.request.start_date))
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
