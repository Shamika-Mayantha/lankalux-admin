'use client'

import { useState, useRef, useEffect } from 'react'
import { ChevronDown } from 'lucide-react'

export interface SelectOption {
  value: string
  label: string
}

interface SelectProps {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  label?: string
  id?: string
  className?: string
  /** Optional: min width of trigger (e.g. "180px") */
  minWidth?: string
  /** Optional: full width of trigger */
  fullWidth?: boolean
  disabled?: boolean
}

const triggerBase =
  'w-full flex items-center justify-between gap-3 rounded-xl border border-accent bg-card text-primary transition-all duration-200 outline-none ' +
  'px-[14px] py-[10px] text-left text-sm ' +
  'hover:border-[color:var(--accent-gold)] hover:border-opacity-60 focus:ring-2 focus:ring-[color:var(--accent-gold)] focus:ring-opacity-20 ' +
  'disabled:opacity-50 disabled:cursor-not-allowed'

export function Select({
  value,
  onChange,
  options,
  placeholder = 'Select…',
  label,
  id,
  className = '',
  minWidth,
  fullWidth,
  disabled = false,
}: SelectProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const selectedOption = options.find((o) => o.value === value)
  const displayLabel = selectedOption ? selectedOption.label : placeholder

  useEffect(() => {
    if (!open) return
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [open])

  return (
    <div ref={containerRef} className={fullWidth ? 'w-full' : 'inline-block'} style={minWidth ? { minWidth } : undefined}>
      {label && (
        <label htmlFor={id} className="label-theme">
          {label}
        </label>
      )}
      <div className={`relative ${className}`}>
        <button
          type="button"
          id={id}
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={label || placeholder}
          onClick={() => !disabled && setOpen((o) => !o)}
          className={`${triggerBase} ${open ? 'ring-2 ring-[color:var(--accent-gold)] ring-opacity-20' : ''}`}
          style={minWidth && !fullWidth ? { minWidth } : undefined}
        >
          <span className={selectedOption ? 'text-primary' : 'text-secondary'}>{displayLabel}</span>
          <ChevronDown
            className={`w-4 h-4 shrink-0 text-accent-theme opacity-80 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          />
        </button>

        {open && (
          <div
            role="listbox"
            className="absolute z-50 mt-1.5 w-full rounded-xl border border-accent bg-card py-1.5 shadow-card"
          >
            {options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={opt.value === value}
                onClick={() => {
                  onChange(opt.value)
                  setOpen(false)
                }}
                className={`w-full text-left px-[14px] py-[10px] text-sm transition-colors ${
                  opt.value === value
                    ? 'bg-[color:var(--accent-gold)]/15 text-accent-theme font-medium'
                    : 'text-primary hover:bg-[color:var(--accent-gold)]/10'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
