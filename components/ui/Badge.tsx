'use client'

export function Badge({
  children,
  variant = 'gold',
  className = '',
}: {
  children: React.ReactNode
  variant?: 'gold' | 'muted' | 'success'
  className?: string
}) {
  const styles = {
    gold: 'bg-[#d4af37] text-black border border-[#e8c96b]',
    muted: 'bg-zinc-800 text-zinc-400 border border-zinc-600',
    success: 'bg-emerald-900/50 text-emerald-300 border border-emerald-700',
  }
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider rounded-md ${styles[variant]} ${className}`}
    >
      {children}
    </span>
  )
}
