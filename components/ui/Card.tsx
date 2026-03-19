'use client'

import type { HTMLAttributes } from 'react'

export function Card({
  className = '',
  children,
  elevated,
  ...props
}: HTMLAttributes<HTMLDivElement> & { elevated?: boolean }) {
  return (
    <div
      className={`rounded-2xl border border-[#2a2824] bg-[#161513] text-left shadow-lg ${
        elevated ? 'shadow-xl shadow-black/40 ring-1 ring-[#d4af37]/10' : 'shadow-black/20'
      } ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}

export function CardHeader({ className = '', children }: { className?: string; children: React.ReactNode }) {
  return <div className={`px-6 pt-6 pb-2 ${className}`}>{children}</div>
}

export function CardContent({ className = '', children }: { className?: string; children: React.ReactNode }) {
  return <div className={`px-6 pb-6 ${className}`}>{children}</div>
}
