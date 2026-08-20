import type { ItineraryStyle, RequestStatus } from '@/config/status'

export type TravelInfo = {
  from: string
  to: string
  estimated_distance: string
  estimated_duration: string
}

export type ItineraryDay = {
  day: number
  date: string
  location: string
  overnight_location: string
  title: string
  description: string
  activities: string[]
  optional_activities: string[]
  travel: TravelInfo
  recommended_images: string[]
  hotel_id?: string | null
}

export type StructuredItinerary = {
  title: string
  summary: string
  duration: string
  days: ItineraryDay[]
  vehicle_id?: string | null
  internal_notes?: string
  /** Client-facing quote, e.g. "USD 2,850 per person" */
  price?: string | null
  /** Road kilometres, Colombo to Colombo. Computed, not taken from the model. */
  total_kilometers?: number
}

export type ItineraryRecord = {
  id: string
  request_id: string
  option_number: 1 | 2 | 3
  style: ItineraryStyle
  status: 'empty' | 'generating' | 'draft' | 'published' | 'failed' | 'archived'
  is_selected: boolean
  title: string
  summary: string
  duration: string
  payload: StructuredItinerary
  vehicle_id: string | null
  internal_notes: string
  prompt_version: string | null
  model: string | null
  error: string | null
  created_at: string
  updated_at: string
}

export type ClientParty = {
  adults: number
  children: number
  childrenAges: number[]
}

export type CanonicalJourney = {
  requestId: string
  clientName: string
  email: string | null
  whatsapp: string | null
  title: string
  summary: string
  startDate: string | null
  endDate: string | null
  durationDays: number | null
  durationLabel: string
  party: ClientParty
  days: ItineraryDay[]
  vehicle: {
    id: string
    name: string
    description: string
    photos: string[]
  } | null
  hotels: Array<{
    id: string
    name: string
    destination: string
    star_category: string
    description: string
    room_category: string
    meal_plan: string
    images: string[]
    website: string | null
  }>
  includedServices: string[]
  importantInformation: string[]
  shareToken?: string
  optionNumber?: number
  style?: ItineraryStyle
  /** Shown on the client journey when the admin chooses to include the price. */
  price?: string | null
  /** Total road kilometres for the published journey. */
  totalKilometers?: number
}

export type ClientRequestRow = {
  id: string
  client_name: string | null
  email: string | null
  whatsapp: string | null
  origin_country: string | null
  start_date: string | null
  end_date: string | null
  duration: number | null
  number_of_adults: number | null
  number_of_children: number | null
  children_ages: string | null
  additional_preferences: string | null
  itineraryoptions: string | null
  selected_option: number | null
  public_token: string | null
  status: string | null
  cancellation_reason: string | null
  notes: string | null
  assigned_employee: string | null
  lead_source: string | null
  budget: string | null
  hotel_preference: string | null
  vehicle_preference: string | null
  special_requirements: string | null
  interests: string | null
  arrival_flight: string | null
  departure_flight: string | null
  requested_destinations: string | null
  selected_itinerary_id: string | null
  published_itinerary_id: string | null
  sent_at: string | null
  last_sent_at: string | null
  email_sent_count: number | null
  hotel_options: string | null
  created_at: string
  updated_at: string | null
}

export type RequestInput = {
  client_name: string
  email: string
  whatsapp?: string | null
  origin_country?: string | null
  start_date?: string | null
  end_date?: string | null
  number_of_adults?: number | null
  number_of_children?: number | null
  children_ages?: number[]
  additional_preferences?: string | null
  assigned_employee?: string | null
  lead_source?: string | null
  budget?: string | null
  hotel_preference?: string | null
  vehicle_preference?: string | null
  special_requirements?: string | null
  interests?: string | null
  arrival_flight?: string | null
  departure_flight?: string | null
  requested_destinations?: string | null
  notes?: string | null
  status?: RequestStatus
}

export type ActivityEvent = {
  id?: string
  request_id: string
  actor?: string | null
  event_type: string
  detail?: Record<string, unknown>
  created_at?: string
}

export type InvoiceStatus =
  | 'draft'
  | 'finalized'
  | 'sent'
  | 'partially_paid'
  | 'paid'
  | 'overdue'
  | 'cancelled'

export type InvoicePaymentStatus = 'unpaid' | 'partially_paid' | 'paid' | 'overdue'

export type InvoicePaymentMethod = 'bank_transfer' | 'card' | 'cash' | 'online_payment' | 'other'

export type InvoiceRecord = {
  id: string
  request_id: string
  selected_itinerary_id: string | null
  vehicle_id: string | null
  chauffeur_guide_id: string | null
  share_link_token: string | null
  revision_of: string | null
  invoice_number: string
  status: InvoiceStatus
  payment_status: InvoicePaymentStatus
  invoice_date: string
  due_date: string | null
  currency: string
  package_total: number
  package_description: string
  client_note: string | null
  payment_instructions: Record<string, unknown>
  client_snapshot: Record<string, unknown>
  journey_snapshot: Record<string, unknown>
  vehicle_snapshot: Record<string, unknown>
  chauffeur_snapshot: Record<string, unknown>
  totals_snapshot: Record<string, unknown>
  secure_journey_url: string | null
  finalized_at: string | null
  finalized_by: string | null
  sent_at: string | null
  sent_by: string | null
  cancelled_at: string | null
  cancelled_by: string | null
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
}

export type InvoicePaymentRecord = {
  id: string
  invoice_id: string
  amount: number
  currency: string
  payment_date: string
  payment_method: InvoicePaymentMethod
  reference_number: string | null
  note: string | null
  status: 'successful' | 'void'
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
}

export type HotelRecord = {
  id: string
  name: string
  destination: string | null
  star_category: string | null
  description: string | null
  room_category: string | null
  meal_plan: string | null
  price_internal: string | null
  images: string[]
  website: string | null
  contact: string | null
  internal_notes: string | null
  active: boolean
}

export type VehicleRecord = {
  id: string
  name: string
  type: string | null
  passenger_capacity: number | null
  luggage_capacity: string | null
  description: string | null
  photos: string[]
  availability_status: string
  internal_notes: string | null
  active: boolean
}

export type GenerationLog = {
  id?: string
  request_id: string
  itinerary_id?: string | null
  itinerary_number: 1 | 2 | 3
  prompt_version: string
  model: string
  success: boolean
  error?: string | null
  raw_response?: string | null
  parsed_response?: unknown
  retry_count: number
  created_at?: string
}
