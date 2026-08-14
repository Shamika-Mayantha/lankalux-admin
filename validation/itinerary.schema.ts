import { z } from 'zod'

export const travelSchema = z
  .object({
    from: z.string().optional().default(''),
    to: z.string().optional().default(''),
    estimated_distance: z.string().optional().default(''),
    estimated_duration: z.string().optional().default(''),
  })
  .passthrough()

const stringArray = z
  .array(z.union([z.string(), z.number()]))
  .optional()
  .default([])
  .transform((arr) => arr.map((x) => String(x).trim()).filter(Boolean))

export const daySchema = z
  .object({
    day: z.coerce.number().int().positive(),
    date: z.string().optional().default(''),
    location: z.string().optional().default(''),
    overnight_location: z.string().optional().default(''),
    title: z.string().optional().default(''),
    description: z.string().optional().default(''),
    activities: stringArray,
    optional_activities: stringArray,
    travel: travelSchema.optional(),
    recommended_images: stringArray,
    what_to_expect: z.string().optional(),
    image: z.string().optional(),
  })
  .passthrough()

export const itinerarySchema = z
  .object({
    title: z.string().min(1, 'Itinerary title is required'),
    summary: z.string().min(1, 'Itinerary summary is required'),
    duration: z.union([z.string(), z.number()]).optional(),
    price: z.string().optional(),
    days: z.array(daySchema).min(1, 'Itinerary must contain at least one day'),
    total_kilometers: z.union([z.number(), z.string()]).optional(),
  })
  .passthrough()

export type ParsedItinerary = z.infer<typeof itinerarySchema>

export function parseItineraryJson(raw: unknown): { ok: true; data: ParsedItinerary } | { ok: false; error: string } {
  const parsed = itinerarySchema.safeParse(raw)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return {
      ok: false,
      error: `Unable to parse generated itinerary. ${first?.path.join('.') || 'payload'}: ${first?.message || 'invalid JSON'}`,
    }
  }
  return { ok: true, data: parsed.data }
}

export function extractJsonObject(text: string): unknown {
  const cleaned = text
    .trim()
    .replace(/^```(?:json|JSON)?\s*/m, '')
    .replace(/\s*```$/m, '')
    .trim()
  const match = cleaned.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('Unable to parse generated itinerary. The model did not return JSON.')
  return JSON.parse(match[0])
}
