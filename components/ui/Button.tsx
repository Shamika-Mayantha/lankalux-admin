'use client'

import { forwardRef, type ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'whatsapp'

const variants: Record<Variant, string> = {
  primary:
    'bg-[#d4af37] hover:bg-[#b8941f] text-black shadow-md hover:shadow-lg hover:shadow-[#d4af37]/25 hover:-translate-y-0.5',
  secondary:
    'bg-zinc-800 hover:bg-zinc-700 text-[#e8d5a3] border border-zinc-600 hover:border-[#d4af37]/50',
  ghost: 'bg-transparent hover:bg-zinc-800/80 text-zinc-300 border border-zinc-700',
  danger: 'bg-red-900/60 hover:bg-red-800 text-red-100 border border-red-800',
  whatsapp: 'bg-[#25D366] hover:bg-[#20bd5a] text-white shadow-md hover:shadow-lg hover:-translate-y-0.5',
}

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: Variant
    size?: 'sm' | 'md' | 'lg' | 'icon'
  }
>(function Button({ className = '', variant = 'primary', size = 'md', children, ...props }, ref) {
  const sizes = {
    sm: 'px-3 py-1.5 text-sm gap-1.5 rounded-lg',
    md: 'px-4 py-2.5 text-sm gap-2 rounded-xl',
    lg: 'px-6 py-3 text-base gap-2 rounded-xl',
    icon: 'p-2.5 rounded-xl aspect-square justify-center',
  }
  return (
    <button
      ref={ref}
      type="button"
      className={`inline-flex items-center justify-center font-semibold transition-all duration-200 disabled:opacity-45 disabled:cursor-not-allowed disabled:hover:translate-y-0 ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
})
