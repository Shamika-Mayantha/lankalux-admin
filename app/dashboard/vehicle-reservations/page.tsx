'use client'

import { useState, useEffect, useCallback } from 'react'
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

export default function VehicleReservationsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [vehicle, setVehicle] = useState<VehicleName>(VEHICLES[0])
  const [reservedDates, setReservedDates] = useState<Set<string>>(new Set())
  const [calendarDate, setCalendarDate] = useState(() => new Date())
  const [toggling, setToggling] = useState<string | null>(null)

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

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#d4af37] mb-4" />
          <p className="text-gray-400">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-[#0a0a0a] to-black text-white p-6">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold bg-gradient-to-r from-[#d4af37] to-[#b8941f] bg-clip-text text-transparent mb-6">
          Vehicle reservations
        </h1>

        <div className="mb-6">
          <label className="block text-sm text-gray-400 uppercase tracking-wide mb-2">Vehicle</label>
          <select
            value={vehicle}
            onChange={(e) => setVehicle(e.target.value as VehicleName)}
            className="w-full max-w-xs px-4 py-2.5 bg-[#1a1a1a] border border-[#333] rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-[#d4af37]"
          >
            {VEHICLES.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </div>

        <div className="bg-[#1a1a1a]/50 border border-[#333] rounded-xl p-4 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <button
              type="button"
              onClick={prevMonth}
              className="p-2 rounded-lg hover:bg-[#333] text-gray-300 hover:text-white transition-colors"
              aria-label="Previous month"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h2 className="text-lg font-semibold text-white">{monthLabel}</h2>
            <button
              type="button"
              onClick={nextMonth}
              className="p-2 rounded-lg hover:bg-[#333] text-gray-300 hover:text-white transition-colors"
              aria-label="Next month"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 mb-2">
            {weekDays.map((d) => (
              <div key={d} className="text-center text-xs text-gray-500 font-medium py-1">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {days.map((day, i) => {
              if (day === null) return <div key={`empty-${i}`} className="aspect-square" />
              const key = dateKey(year, month, day)
              const isReserved = reservedDates.has(key)
              const isToggling = toggling === key
              const isToday =
                new Date().getFullYear() === year &&
                new Date().getMonth() === month &&
                new Date().getDate() === day
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleDate(year, month, day)}
                  disabled={isToggling}
                  className={`
                    aspect-square rounded-lg text-sm font-medium transition-colors disabled:opacity-50
                    ${isReserved ? 'bg-[#d4af37] text-black' : 'bg-[#252525] text-gray-300 hover:bg-[#333]'}
                    ${isToday ? 'ring-2 ring-[#d4af37] ring-offset-2 ring-offset-[#0a0a0a]' : ''}
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
          <p className="text-xs text-gray-500 mt-3">Click a date to mark or unmark as reserved.</p>
        </div>
      </div>
    </div>
  )
}
