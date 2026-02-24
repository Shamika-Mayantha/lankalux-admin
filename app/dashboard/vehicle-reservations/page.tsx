'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const VEHICLES = ['Toyota Voxy'] as const
const TABLE_NAME = 'Vehicle Reservations'

type VehicleName = (typeof VEHICLES)[number]

function getMonthDays(year: number, month: number) {
  const first = new Date(year, month, 1)
  const last = new Date(year, month + 1, 0)
  const startPad = first.getDay()
  const daysInMonth = last.getDate()
  const days: (number | null)[] = []
  for (let i = 0; i < startPad; i++) days.push(null)
  for (let d = 1; d <= daysInMonth; d++) days.push(d)
  return days
}

function dateKey(year: number, month: number, day: number): string {
  const m = String(month + 1).padStart(2, '0')
  const d = String(day).padStart(2, '0')
  return `${year}-${m}-${d}`
}

function formatReservedDate(iso: string): string {
  try {
    return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}

export default function VehicleReservationsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [vehicle, setVehicle] = useState<VehicleName>(VEHICLES[0])
  const [reservedDates, setReservedDates] = useState<Set<string>>(new Set())
  const [calendarDate, setCalendarDate] = useState(() => new Date())
  const [toggling, setToggling] = useState<string | null>(null)
  const [savedFeedback, setSavedFeedback] = useState(false)

  const year = calendarDate.getFullYear()
  const month = calendarDate.getMonth()

  const loadReservations = useCallback(async () => {
    try {
      const { data, error } = await (supabase.from(TABLE_NAME) as any)
        .select('reserved_date')
        .eq('vehicle_name', vehicle)

      if (error) {
        console.error('Error fetching reservations:', error)
        setReservedDates(new Set())
        return
      }

      const dates = new Set(
        (data || [])
          .map((row: { reserved_date: string }) => {
            const d = row.reserved_date
            if (typeof d !== 'string') return null
            return d.slice(0, 10)
          })
          .filter(Boolean) as string[]
      )
      setReservedDates(dates)
    } catch (err) {
      console.error('Unexpected error loading reservations:', err)
      setReservedDates(new Set())
    }
  }, [vehicle])

  useEffect(() => {
    loadReservations()
  }, [loadReservations])

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session }, error } = await supabase.auth.getSession()
      if (error || !session?.user) {
        router.push('/login')
        return
      }
      setLoading(false)
    }
    checkSession()
  }, [router])

  const toggleDate = async (year: number, month: number, day: number) => {
    const key = dateKey(year, month, day)
    if (toggling) return
    setToggling(key)

    try {
      if (reservedDates.has(key)) {
        const { error } = await (supabase.from(TABLE_NAME) as any)
          .delete()
          .eq('vehicle_name', vehicle)
          .eq('reserved_date', key)

        if (error) {
          console.error('Error removing reservation:', error)
          return
        }
        setReservedDates((prev) => {
          const next = new Set(prev)
          next.delete(key)
          return next
        })
      } else {
        const { error } = await (supabase.from(TABLE_NAME) as any).insert({
          vehicle_name: vehicle,
          reserved_date: key,
        })

        if (error) {
          console.error('Error adding reservation:', error)
          return
        }
        setReservedDates((prev) => new Set(prev).add(key))
      }
    } finally {
      setToggling(null)
    }
  }

  const prevMonth = () => setCalendarDate((d) => new Date(d.getFullYear(), d.getMonth() - 1))
  const nextMonth = () => setCalendarDate((d) => new Date(d.getFullYear(), d.getMonth() + 1))

  const monthLabel = calendarDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  const days = getMonthDays(year, month)
  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  const sortedReservedDates = useMemo(() => {
    return Array.from(reservedDates).sort()
  }, [reservedDates])

  const todayKey = useMemo(() => {
    const t = new Date()
    return dateKey(t.getFullYear(), t.getMonth(), t.getDate())
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-2 border-amber-500/20 border-t-amber-400/70 mb-4" />
          <p className="text-gray-500">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-[#0c0c0c] to-gray-950 text-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 bg-white/[0.04] backdrop-blur-sm border border-white/10 rounded-2xl p-5 shadow-xl">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => router.push('/dashboard')}
              className="flex items-center gap-2 text-gray-400 hover:text-amber-300 transition-colors shrink-0"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              <span className="hidden sm:inline">Back to Dashboard</span>
            </button>
            <div className="h-6 w-px bg-white/10 hidden sm:block" />
            <img src="/favicon.png" alt="LankaLux" className="h-10 w-10 object-cover rounded-lg" />
            <div>
              <h1 className="text-xl font-bold text-amber-200/95">
                Vehicle Availability
              </h1>
              <p className="text-gray-500 text-sm">Track when each vehicle is reserved</p>
            </div>
          </div>
          <button
            type="button"
            onClick={async () => {
              await loadReservations()
              setSavedFeedback(true)
              setTimeout(() => setSavedFeedback(false), 2000)
            }}
            className="px-4 py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 font-medium rounded-xl border border-amber-500/30 transition-all shrink-0"
          >
            {savedFeedback ? 'Saved' : 'Refresh'}
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Vehicle + Calendar */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-5">
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                <span className="w-1 h-4 bg-amber-500/80 rounded-full" />
                Select Vehicle
              </h2>
              <select
                value={vehicle}
                onChange={(e) => setVehicle(e.target.value as VehicleName)}
                className="w-full sm:max-w-xs px-4 py-2.5 bg-white/[0.06] border border-white/10 rounded-xl text-gray-200 focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500/40"
              >
                {VEHICLES.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
              <p className="text-gray-500 text-sm mt-2">
                {reservedDates.size} date{reservedDates.size !== 1 ? 's' : ''} reserved for this vehicle
              </p>
            </div>

            <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-5 sm:p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                  <span className="w-1 h-4 bg-amber-500/80 rounded-full" />
                  Calendar
                </h2>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={prevMonth}
                    className="p-2 rounded-xl hover:bg-white/10 text-gray-400 hover:text-gray-200 transition-colors"
                    aria-label="Previous month"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <span className="text-white font-medium min-w-[140px] text-center">{monthLabel}</span>
                  <button
                    type="button"
                    onClick={nextMonth}
                    className="p-2 rounded-xl hover:bg-white/10 text-gray-400 hover:text-gray-200 transition-colors"
                    aria-label="Next month"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-7 gap-1 sm:gap-2 mb-3">
                {weekDays.map((d) => (
                  <div key={d} className="text-center text-xs text-gray-500 font-medium py-1.5">
                    {d}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1 sm:gap-2">
                {days.map((day, i) => {
                  if (day === null) return <div key={`empty-${i}`} className="aspect-square" />
                  const key = dateKey(year, month, day)
                  const isReserved = reservedDates.has(key)
                  const isToggling = toggling === key
                  const isToday = key === todayKey
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => toggleDate(year, month, day)}
                      disabled={isToggling}
                      className={`
                        aspect-square rounded-lg text-sm font-medium transition-all disabled:opacity-50
                        flex items-center justify-center
                        ${isReserved ? 'bg-amber-500/25 text-amber-200 border border-amber-500/40 hover:bg-amber-500/35' : 'bg-white/[0.06] text-gray-400 hover:bg-white/[0.1] hover:text-gray-300 border border-transparent'}
                        ${isToday && !isReserved ? 'ring-2 ring-amber-400/50 ring-offset-2 ring-offset-[#1a1a1a]' : ''}
                      `}
                    >
                      {isToggling ? (
                        <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      ) : (
                        day
                      )}
                    </button>
                  )
                })}
              </div>
              <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t border-white/10">
                <span className="flex items-center gap-2 text-xs text-gray-400">
                  <span className="w-3 h-3 rounded bg-amber-500/30 border border-amber-500/40" /> Reserved
                </span>
                <span className="flex items-center gap-2 text-xs text-gray-400">
                  <span className="w-3 h-3 rounded bg-white/[0.06]" /> Available
                </span>
                <span className="flex items-center gap-2 text-xs text-gray-400">
                  <span className="w-3 h-3 rounded border-2 border-amber-400/50" /> Today
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-2">Click a date to mark as Reserved or Available.</p>
            </div>
          </div>

          {/* Right: Reserved dates list */}
          <div className="lg:col-span-1">
            <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-5 sticky top-4">
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                <span className="w-1 h-4 bg-amber-500/80 rounded-full" />
                Reserved Dates — {vehicle}
              </h2>
              {sortedReservedDates.length === 0 ? (
                <p className="text-gray-500 text-sm">No dates reserved yet. Use the calendar to mark dates.</p>
              ) : (
                <ul className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
                  {sortedReservedDates.map((dateStr) => (
                    <li
                      key={dateStr}
                      className="flex items-center justify-between gap-2 py-2.5 px-3 rounded-xl bg-white/[0.06] border border-white/10"
                    >
                      <span className="text-gray-300 text-sm font-medium">
                        {formatReservedDate(dateStr)}
                      </span>
                      <span className="shrink-0 w-2 h-2 rounded-full bg-amber-400/80" />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
