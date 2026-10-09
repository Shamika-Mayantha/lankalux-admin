import { DEFAULT_BRAND_LOGO_URL } from '@/lib/email-templates'
import { renderFollowUpEmail } from '@/services/journey-copy'
import { deliverMail, replyAddressFor, requireMailer, senderFor } from '@/services/mailer'
import { getServiceClient } from '@/services/supabase.server'

/**
 * Evening-before trip emails for guests on a published journey.
 *
 * Runs once a day at 19:00 Sri Lanka time (vercel.json). Every guest whose journey has a
 * travel day tomorrow gets one email: "Your journey starts tomorrow" before day 1, and
 * "Tomorrow: Day N" for the days after, with the pickup time, the plan, the hotel and a
 * link to follow the chauffeur live on the guest website.
 */

export const GUEST_SITE_URL = (process.env.NEXT_PUBLIC_GUEST_SITE_URL || 'https://guest.lankalux.com').replace(/\/$/, '')

const TZ = 'Asia/Colombo'
const DAY = 86_400_000

type TripRow = {
  id: string
  request_id: string | null
  driver_id: string | null
  vehicle_name: string | null
  title: string | null
  guest_display_name: string | null
  start_date: string
  end_date: string | null
  status: string | null
}

type DayRow = {
  id: string
  trip_id: string
  day_number: number
  title: string | null
  origin: string | null
  destination: string | null
  planned_start: string | null
  hotel_name: string | null
}

type StopRow = { trip_day_id: string; name: string | null; sort_order: number | null }

export type TripReminder = {
  tripId: string
  requestId: string | null
  to: string
  clientName: string
  dayNumber: number
  subject: string
  html: string
  text: string
}

export function colomboDate(now: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

function addDays(ymd: string, days: number): string {
  return new Date(Date.parse(`${ymd}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10)
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY)
}

function longDate(ymd: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(
    Date.parse(`${ymd}T00:00:00Z`)
  )
}

function routeOf(day: DayRow): string {
  const parts = [day.origin, day.destination].map((p) => p?.trim()).filter(Boolean)
  return parts.length ? parts.join(' to ') : day.title?.trim() || `Day ${day.day_number}`
}

export function buildReminder(input: {
  trip: TripRow
  day: DayRow
  stops: string[]
  date: string
  clientName: string
  chauffeur: string | null
}): { subject: string; html: string; text: string } {
  const { trip, day, stops, date, clientName, chauffeur } = input
  const first = day.day_number === 1
  const route = routeOf(day)
  const subject = first ? 'Your LankaLux journey starts tomorrow' : `Tomorrow: Day ${day.day_number}, ${route}`

  const paragraphs: string[] = []
  paragraphs.push(
    first
      ? `Your journey begins tomorrow, ${longDate(date)}. Here is the plan for your first day: ${route}.`
      : `Here is your plan for tomorrow, ${longDate(date)}: Day ${day.day_number}, ${route}.`
  )
  const meet = [
    day.planned_start?.trim() ? `Pickup is at ${day.planned_start.trim()}.` : null,
    chauffeur ? `${chauffeur} will be your chauffeur${trip.vehicle_name ? `, in the ${trip.vehicle_name}` : ''}.` : null,
  ].filter(Boolean)
  if (meet.length) paragraphs.push(meet.join(' '))
  if (stops.length) paragraphs.push(`The day:\n${stops.map((s) => `• ${s}`).join('\n')}`)
  if (day.hotel_name?.trim()) paragraphs.push(`Tomorrow night you stay at ${day.hotel_name.trim()}.`)
  paragraphs.push(
    'On the day you can follow your chauffeur live on the map and message them from the LankaLux guest site. Sign in with this email address and we will send you a code.'
  )

  const { html, text } = renderFollowUpEmail({
    clientName,
    bodyText: paragraphs.join('\n\n'),
    logoUrl: DEFAULT_BRAND_LOGO_URL,
    ctaUrl: GUEST_SITE_URL,
    ctaLabel: 'Open my journey',
  })
  return { subject, html, text }
}

/** The emails due tonight, without sending them. */
export async function listTripReminders(now = Date.now()): Promise<TripReminder[]> {
  const supabase = getServiceClient()
  const tomorrow = addDays(colomboDate(now), 1)

  const { data: trips, error } = await supabase
    .from('trips')
    .select('id, request_id, driver_id, vehicle_name, title, guest_display_name, start_date, end_date, status')
    .in('status', ['upcoming', 'active'])
    .lte('start_date', tomorrow)
    .gte('end_date', tomorrow)
  if (error) throw new Error(`Could not load trips: ${error.message}`)
  const due = (trips || []) as TripRow[]
  if (!due.length) return []

  const tripIds = due.map((t) => t.id)
  const requestIds = due.map((t) => t.request_id).filter((v): v is string => Boolean(v))
  const driverIds = due.map((t) => t.driver_id).filter((v): v is string => Boolean(v))

  const [{ data: days }, { data: requests }, { data: drivers }] = await Promise.all([
    supabase
      .from('trip_days')
      .select('id, trip_id, day_number, title, origin, destination, planned_start, hotel_name')
      .in('trip_id', tripIds),
    requestIds.length
      ? supabase.from('Client Requests').select('id, client_name, email').in('id', requestIds)
      : Promise.resolve({ data: [] as { id: string; client_name: string | null; email: string | null }[] }),
    driverIds.length
      ? supabase.from('drivers').select('id, full_name').in('id', driverIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string | null }[] }),
  ])

  const dayFor = new Map<string, DayRow>()
  for (const t of due) {
    const n = daysBetween(t.start_date, tomorrow) + 1
    const d = ((days || []) as DayRow[]).find((row) => row.trip_id === t.id && row.day_number === n)
    if (!d) continue
    // Published days often only name where the day ends; the day before says where it starts.
    const prev = ((days || []) as DayRow[]).find((row) => row.trip_id === t.id && row.day_number === n - 1)
    dayFor.set(t.id, d.origin?.trim() || !prev?.destination ? d : { ...d, origin: prev.destination })
  }
  const dayIds = [...dayFor.values()].map((d) => d.id)
  const { data: stops } = dayIds.length
    ? await supabase.from('trip_stops').select('trip_day_id, name, sort_order').in('trip_day_id', dayIds)
    : { data: [] as StopRow[] }

  const requestById = new Map((requests || []).map((r) => [String(r.id), r]))
  const driverById = new Map((drivers || []).map((d) => [String(d.id), d.full_name?.trim() || null]))

  const out: TripReminder[] = []
  for (const trip of due) {
    const day = dayFor.get(trip.id)
    const request = trip.request_id ? requestById.get(trip.request_id) : undefined
    const to = request?.email?.trim().toLowerCase()
    if (!day || !to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) continue
    const names = ((stops || []) as StopRow[])
      .filter((s) => s.trip_day_id === day.id && s.name?.trim())
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map((s) => s.name!.trim().replace(/^(\d{1,2}[:.]\d{2}(?:\s*[AP]M)?)\s*-\s*/i, '$1  '))
    const clientName = trip.guest_display_name?.trim() || request?.client_name?.trim() || ''
    const chauffeur = trip.driver_id ? driverById.get(trip.driver_id) ?? null : null
    const email = buildReminder({ trip, day, stops: names, date: tomorrow, clientName, chauffeur })
    out.push({ tripId: trip.id, requestId: trip.request_id, to, clientName, dayNumber: day.day_number, ...email })
  }
  return out
}

export async function sendTripReminders(now = Date.now()) {
  requireMailer()
  const due = await listTripReminders(now)
  const sent: string[] = []
  const failed: string[] = []
  for (const r of due) {
    try {
      await deliverMail({
        from: senderFor(null),
        to: r.to,
        replyTo: (r.requestId && replyAddressFor(r.requestId)) || null,
        subject: r.subject,
        text: r.text,
        html: r.html,
      })
      sent.push(r.tripId)
    } catch (err) {
      failed.push(r.tripId)
      console.error('[trip-reminders] failed for trip', r.tripId, err instanceof Error ? err.message : err)
    }
  }
  return { due: due.length, sent: sent.length, failed: failed.length }
}
