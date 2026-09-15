'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react'

type DatePickerTheme = 'dark' | 'light' | 'brand'

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
  rangeStart?: string
  rangeEnd?: string
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

function placeCalendar(trigger: HTMLElement, calWidth = 340, calHeight = 380) {
  const r = trigger.getBoundingClientRect()
  const width = Math.min(calWidth, window.innerWidth * 0.92)
  let left = r.left
  if (left + width > window.innerWidth - 12) left = Math.max(12, window.innerWidth - width - 12)
  if (left < 12) left = 12
  const opensUp = window.innerHeight - r.bottom < calHeight && r.top > calHeight
  const top = opensUp ? Math.max(12, r.top - calHeight - 8) : r.bottom + 8
  return { top, left, width }
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
  rangeStart,
  rangeEnd,
}: DatePickerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const calRef = useRef<HTMLDivElement>(null)
  const selected = useMemo(() => parseIsoDate(value), [value])
  const minDate = useMemo(() => parseIsoDate(min), [min])
  const maxDate = useMemo(() => parseIsoDate(max), [max])

  const [open, setOpen] = useState(false)
  const [view, setView] = useState<Date>(() => selected ?? new Date())
  const [calPos, setCalPos] = useState<{ top: number; left: number; width: number } | null>(null)

  useEffect(() => {
    if (selected) setView(selected)
  }, [selected])

  useEffect(() => {
    if (!open) return
    const place = () => {
      if (triggerRef.current) setCalPos(placeCalendar(triggerRef.current))
    }
    place()
    const onDocMouseDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (containerRef.current?.contains(t) || calRef.current?.contains(t)) return
      setOpen(false)
    }
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    document.addEventListener('keydown', onEsc)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown)
      document.removeEventListener('keydown', onEsc)
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
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

  const tripStart = useMemo(() => parseIsoDate(rangeStart), [rangeStart])
  const tripEnd = useMemo(() => parseIsoDate(rangeEnd), [rangeEnd])
  const inTrip = (date: Date) => {
    if (!tripStart || !tripEnd) return false
    return date >= tripStart && date <= tripEnd
  }

  const isBrand = theme === 'brand'
  const triggerClasses = isBrand
    ? 'll-dp-trigger'
    : theme === 'light'
      ? 'w-full flex items-center justify-between gap-3 px-4 py-3 bg-gray-50 border border-gray-200 rounded-md text-left text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#d4af37] focus:border-transparent transition-all disabled:opacity-50 disabled:cursor-not-allowed'
      : 'w-full flex items-center justify-between gap-3 rounded-xl border border-accent bg-card text-primary transition-all duration-200 outline-none px-[14px] py-[10px] text-left text-sm hover:border-[color:var(--accent-gold)] hover:border-opacity-60 focus:ring-2 focus:ring-[color:var(--accent-gold)] focus:ring-opacity-20 disabled:opacity-50 disabled:cursor-not-allowed'

  const popoverClasses = isBrand
    ? 'll-dp-cal'
    : theme === 'light'
      ? 'absolute z-50 mt-2 w-[320px] max-w-[92vw] rounded-xl border border-gray-200 bg-white p-4 shadow-xl'
      : 'absolute z-50 mt-2 w-[320px] max-w-[92vw] rounded-xl border border-accent bg-card p-4 shadow-card'

  const mutedText = isBrand ? 'll-dp-muted' : theme === 'light' ? 'text-gray-500' : 'text-secondary'
  const headerText = isBrand ? 'll-dp-month' : theme === 'light' ? 'text-gray-800' : 'text-primary'
  const weekText = isBrand ? 'll-dp-week' : theme === 'light' ? 'text-gray-500' : 'text-secondary'
  const navBtn = isBrand
    ? 'll-dp-nav'
    : theme === 'light'
      ? 'p-2 rounded-lg hover:bg-gray-100 text-gray-700'
      : 'p-2 rounded-lg hover:bg-[var(--bg-btn-secondary)] text-primary'
  const dayBase = isBrand
    ? 'll-dp-day'
    : 'aspect-square rounded-lg text-sm transition-colors'
  const dayDefault = isBrand
    ? ''
    : theme === 'light'
      ? 'text-gray-700 hover:bg-gray-100'
      : 'text-primary hover:bg-[color:var(--accent-gold)]/10'
  const dayDisabled = isBrand
    ? 'is-disabled'
    : theme === 'light'
      ? 'text-gray-300 cursor-not-allowed'
      : 'text-secondary opacity-50 cursor-not-allowed'
  const daySelected = isBrand
    ? 'is-selected'
    : theme === 'light'
      ? 'bg-[#d4af37] text-black font-semibold'
      : 'bg-[color:var(--accent-gold)] text-black font-semibold'
  const dayToday = isBrand
    ? 'is-today'
    : theme === 'light'
      ? 'ring-1 ring-[#d4af37]/60'
      : 'ring-1 ring-[color:var(--accent-gold)]/60'
  const dayRange = isBrand
    ? 'is-range'
    : theme === 'light'
      ? 'bg-[#d4af37]/15 text-gray-800'
      : 'bg-[color:var(--accent-gold)]/15 text-primary'
  const iconClass = isBrand
    ? 'll-dp-icon'
    : theme === 'light'
      ? 'w-4 h-4 shrink-0 text-gray-500'
      : 'w-4 h-4 shrink-0 text-accent-theme'
  const valueClass = selected
    ? isBrand
      ? 'll-dp-value'
      : theme === 'light'
        ? 'text-gray-900'
        : 'text-primary'
    : mutedText
  const footerBtn = isBrand
    ? 'll-dp-foot'
    : theme === 'light'
      ? 'text-xs text-gray-500 hover:text-gray-700 transition-colors'
      : 'text-xs text-secondary hover:text-primary transition-colors'
  const closeBtn = isBrand
    ? 'll-dp-foot'
    : theme === 'light'
      ? 'text-xs text-gray-700 hover:text-black transition-colors'
      : 'text-xs text-primary hover:text-accent-theme transition-colors'

  const displayValue = selected
    ? selected.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
    : placeholder

  function renderCalendar() {
    return (
    <div
      ref={calRef}
      className={popoverClasses}
      role="dialog"
      aria-label="Choose a date"
      style={isBrand && calPos ? { top: calPos.top, left: calPos.left, width: calPos.width } : undefined}
    >
      <div className={isBrand ? 'll-dp-head' : 'flex items-center justify-between mb-3'}>
        <button
          type="button"
          onClick={() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1, 12))}
          className={navBtn}
          aria-label="Previous month"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <p className={headerText}>{monthLabel}</p>
        <button
          type="button"
          onClick={() => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1, 12))}
          className={navBtn}
          aria-label="Next month"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className={isBrand ? 'll-dp-weeks' : 'grid grid-cols-7 gap-1 mb-1'}>
        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((wd) => (
          <div key={wd} className={isBrand ? weekText : `text-xs text-center py-1 ${weekText}`}>
            {wd}
          </div>
        ))}
      </div>

      <div className={isBrand ? 'll-dp-grid' : 'grid grid-cols-7 gap-1'}>
        {Array.from({ length: startWeekday }).map((_, i) => (
          <div key={`blank-${i}`} className={isBrand ? 'll-dp-blank' : 'aspect-square'} />
        ))}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1
          const date = new Date(view.getFullYear(), view.getMonth(), day, 12)
          const disabledDay = !inRange(date)
          const selectedDay = !!selected && sameDay(selected, date)
          const todayDay = sameDay(today, date)
          const tripEdge = Boolean(
            (tripStart && sameDay(tripStart, date)) || (tripEnd && sameDay(tripEnd, date))
          )
          const rangeDay = !tripEdge && !disabledDay && inTrip(date)
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
                selectedDay || tripEdge
                  ? daySelected
                  : disabledDay
                    ? dayDisabled
                    : `${dayDefault} ${rangeDay ? dayRange : ''} ${todayDay ? dayToday : ''}`
              }`}
            >
              {day}
            </button>
          )
        })}
      </div>

      <div className={isBrand ? 'll-dp-actions' : 'flex items-center justify-between mt-3 pt-3 border-t border-opacity-20 border-current'}>
        <button
          type="button"
          onClick={() => {
            onChange('')
            setOpen(false)
          }}
          className={footerBtn}
        >
          Clear
        </button>
        <button type="button" onClick={() => setOpen(false)} className={closeBtn}>
          Close
        </button>
      </div>
    </div>
    )
  }

  return (
    <div ref={containerRef} className={`${fullWidth ? 'w-full' : 'inline-block'} ${isBrand ? 'll-dp' : ''}`}>
      {label && (
        <label htmlFor={id} className={isBrand ? 'll-dp-label' : theme === 'light' ? 'block text-sm font-medium text-gray-700 mb-2' : 'label-theme'}>
          {label}
        </label>
      )}
      <div className={isBrand ? 'll-dp-wrap' : `relative ${className}`}>
        <button
          ref={triggerRef}
          id={id}
          type="button"
          disabled={disabled}
          aria-expanded={open}
          aria-haspopup="dialog"
          onClick={() => {
            if (!open && triggerRef.current) setCalPos(placeCalendar(triggerRef.current))
            setOpen((v) => !v)
          }}
          className={triggerClasses}
        >
          <span className={valueClass}>{displayValue}</span>
          <Calendar className={iconClass} />
        </button>

        {open && !isBrand ? renderCalendar() : null}
      </div>
      {open && isBrand && calPos && typeof document !== 'undefined' ? createPortal(renderCalendar(), document.body) : null}
    </div>
  )
}
