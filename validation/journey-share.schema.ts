import { z } from 'zod'
import { ITINERARY_STYLES } from '@/config/status'

// Explicit public fields only: generated payloads can contain internal notes and
// arbitrary model metadata, including inside days and travel objects.
export const journeyShareSchema = z.object({
  requestId: z.string().min(1),
  clientName: z.string(),
  title: z.string().min(1),
  summary: z.string(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  durationDays: z.number().nullable(),
  durationLabel: z.string(),
  party: z.object({
    adults: z.number(),
    children: z.number(),
    childrenAges: z.array(z.number()),
  }),
  days: z.array(z.object({
    day: z.number().int().positive(),
    date: z.string(),
    location: z.string(),
    overnight_location: z.string(),
    title: z.string(),
    description: z.string(),
    activities: z.array(z.string()),
    optional_activities: z.array(z.string()),
    recommended_images: z.array(z.string()),
    travel: z.object({
      from: z.string(),
      to: z.string(),
      estimated_distance: z.string(),
      estimated_duration: z.string(),
    }),
  })).min(1),
  vehicle: z.object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    photos: z.array(z.string()),
  }).nullable(),
  hotels: z.array(z.object({
    id: z.string(),
    name: z.string(),
    destination: z.string(),
    star_category: z.string(),
    description: z.string(),
    room_category: z.string(),
    meal_plan: z.string(),
    images: z.array(z.string()),
    website: z.string().nullable(),
  })),
  includedServices: z.array(z.string()),
  importantInformation: z.array(z.string()),
  optionNumber: z.number().int().positive().optional(),
  style: z.enum(ITINERARY_STYLES).optional(),
  price: z.string().nullable().optional(),
  totalKilometers: z.number().optional(),
}).transform((journey) => ({ ...journey, email: null, whatsapp: null }))
