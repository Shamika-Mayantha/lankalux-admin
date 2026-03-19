'use client'

import { useTheme } from '@/components/ThemeProvider'
import { Moon, Sun } from 'lucide-react'

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
      className="p-2.5 rounded-xl border border-theme bg-card text-primary hover:border-accent transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-[color:var(--accent-gold)] focus:ring-opacity-30"
    >
      {theme === 'light' ? (
        <Moon className="w-5 h-5 text-secondary" />
      ) : (
        <Sun className="w-5 h-5 accent-gold" />
      )}
    </button>
  )
}
