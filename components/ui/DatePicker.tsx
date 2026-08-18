'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react'

type DatePickerTheme = 'dark' | 'light'

interface DatePickerProps {
  value: string
  onChange: (value: string) => void
  label?: string
  id?: string
  min?: string
  max?: string
  placeholder?: string
  disabled?: boolean
  className?: string
  theme?: DatePickerTheme
  fullWidth?: boolean
}

function parseIsoDate(value?: string | null): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [year, month, day] = value.split('-').map(Number)
  if (year < 1900 || year > 2099) return null
  const date = new Date(year, month - 1, day, 12, 0, 0, 0)
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null
  }
  return date
}

function isoDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

export function DatePicker({
  value,
  onChange,
  label,
  id,
  min,
  max,
  placeholder = 'Select date',
  disabled = false,
  className = '',
  theme = 'dark',
  fullWidth = true,
}: DatePickerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const selected = useMemo(() => parseIsoDate(value), [value])
  const minDate = useMemo(() => parseIsoDate(min), [min])
  const maxDate = useMemo(() => parseIsoDate(max), [max])

  const [open, setOpen] = useState(false)
  const [view, setView] = useState<Date>(() => selected ?? new Date())

  useEffect(() => {
    if (selected) setView(selected)
  }, [selected])

  useEffect(() => {
    if (!open) return
    const onDocMouseDown = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open])

  const firstDayOfMonth = new Date(view.getFullYear(), view.getMonth(), 1, 12)
  const daysInMonth = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate()
  const startWeekday = firstDayOfMonth.getDay()

  const monthLabel = firstDayOfMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  const today = new Date()
  today.setHours(12, 0, 0, 0)

  const inRange = (date: Date) => {
    if (minDate && date < minDate) return false
    if (maxDate && date > maxDate) return false
    return true
  }

  const triggerClasses =
    theme === 'light'
      ? 'w-full flex items-center justify-between gap-3 px-4 py-3 bg-gray-50 border border-gray-200 rounded-md text-left text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#d4af37] focus:border-transparent transition-all disabled:opacity-50 disabled:cursor-not-allowed'
      : 'w-full flex items-center justify-between gap-3 rounded-xl border border-accent bg-card text-primary transition-all duration-200 outline-none px-[14px] py-[10px] text-left text-sm hover:border-[color:var(--accent-gold)] hover:border-opacity-60 focus:ring-2 focus:ring-[color:var(--accent-gold)] focus:ring-opacity-20 disabled:opacity-50 disabled:cursor-not-allowed'

  const popoverClasses =
    theme === 'light'
      ? 'absolute z-50 mt-2 w-[320px] max-w-[92vw] rounded-xl border border-gray-200 bg-white p-4 shadow-xl'
      : 'absolute z-50 mt-2 w-[320px] max-w-[92vw] rounded-xl border border-accent bg-card p-4 shadow-card'

  const mutedText = theme === 'light' ? 'text-gray-500' : 'text-secondary'
  const headerText = theme === 'light' ? 'text-gray-800' : 'text-primary'
  const weekText = theme === 'light' ? 'text-gray-500' : 'text-secondary'
  const dayBase = theme === 'light'
    ? 'aspect-square rounded-lg text-sm transition-colors'
    : 'aspect-square rounded-lg text-sm transition-colors'
  const dayDefault = theme === 'light'
    ? 'text-gray-700 hover:bg-gray-100'
    : 'text-primary hover:bg-[color:var(--accent-gold)]/10'
  const dayDisabled = theme === 'light'
    ? 'text-gray-300 cursor-not-allowed'
    : 'text-secondary opacity-50 cursor-not-allowed'
  const daySelected = theme === 'light'
    ? 'bg-[#d4af37] text-black font-semibold'
    : 'bg-[color:var(--accent-gold)] text-black font-semibold'
  const dayToday = theme === 'light'
    ? 'ring-1 ring-[#d4af37]/60'
    : 'ring-1 ring-[color:var(--accent-gold)]/60'

  const displayValue = selected
    ? selected.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
    : placeholder

  return (
    <div ref={containerRef} className={fullWidth ? 'w-full' : 'inline-block'}>
      {label && (
        <label htmlFor={id} className={theme === 'light' ? 'block text-sm font-medium text-gray-700 mb-2' : 'label-theme'}>
          {label}
        </label>
      )}
      <div className={`relative ${className}`}>
        <button
          id={id}
          type="button"
          disabled={disabled}
          onClick={() => setOpen((v) => !v)}
          className={triggerClasses}
        >
          <span className={selected ? (theme === 'light' ? 'text-gray-900' : 'text-primary') : mutedText}>
            {displayValue}
          </span>
          <Calendar className={`w-4 h-4 shrink-0 ${theme === 'light' ? 'text-gray-500' : 'text-accent-theme'}`} />
        </button>

        {open && (
          <div className={popoverClasses}>
            <div className="flex items-center justify-between mb-3">
              <button
                type="button"
                onClick={() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1, 12))}
                className={`p-2 rounded-lg ${theme === 'light' ? 'hover:bg-gray-100 text-gray-700' : 'hover:bg-[var(--bg-btn-secondary)] text-primary'}`}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <p className={`font-semibold ${headerText}`}>{monthLabel}</p>
              <button
                type="button"
                onClick={() => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1, 12))}
                className={`p-2 rounded-lg ${theme === 'light' ? 'hover:bg-gray-100 text-gray-700' : 'hover:bg-[var(--bg-btn-secondary)] text-primary'}`}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-1 mb-1">
              {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((wd) => (
                <div key={wd} className={`text-xs text-center py-1 ${weekText}`}>
                  {wd}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: startWeekday }).map((_, i) => (
                <div key={`blank-${i}`} className="aspect-square" />
              ))}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1
                const date = new Date(view.getFullYear(), view.getMonth(), day, 12)
                const disabledDay = !inRange(date)
                const selectedDay = !!selected && sameDay(selected, date)
                const todayDay = sameDay(today, date)
                return (
                  <button
                    key={day}
                    type="button"
                    disabled={disabledDay}
                    onClick={() => {
                      onChange(isoDate(date))
                      setOpen(false)
                    }}
                    className={`${dayBase} ${
                      selectedDay
                        ? daySelected
                        : disabledDay
                          ? dayDisabled
                          : `${dayDefault} ${todayDay ? dayToday : ''}`
                    }`}
                  >
                    {day}
                  </button>
                )
              })}
            </div>

            <div className="flex items-center justify-between mt-3 pt-3 border-t border-opacity-20 border-current">
              <button
                type="button"
                onClick={() => {
                  onChange('')
                  setOpen(false)
                }}
                className={`text-xs ${theme === 'light' ? 'text-gray-500 hover:text-gray-700' : 'text-secondary hover:text-primary'} transition-colors`}
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className={`text-xs ${theme === 'light' ? 'text-gray-700 hover:text-black' : 'text-primary hover:text-accent-theme'} transition-colors`}
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

