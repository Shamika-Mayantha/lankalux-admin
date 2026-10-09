'use client'

import { useRouter } from 'next/navigation'

/** Table row that opens `href` when clicked anywhere, while links and buttons inside keep working. */
export function RowLink({ href, children }: { href: string; children: React.ReactNode }) {
  const router = useRouter()
  return (
    <tr
      className="ll-row-link"
      onMouseEnter={() => router.prefetch(href)}
      onClick={(e) => {
        const target = e.target as HTMLElement
        if (target.closest('a, button, input, select, textarea, label')) return
        if (window.getSelection()?.toString()) return
        if (e.metaKey || e.ctrlKey) {
          window.open(href, '_blank')
          return
        }
        router.push(href)
      }}
    >
      {children}
    </tr>
  )
}

/** Placeholder rows while a table loads for the first time. */
export function SkeletonRows({ cols, rows = 6 }: { cols: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, i) => (
        <tr key={i} className="ll-skel-row" aria-hidden="true">
          {Array.from({ length: cols }, (_, j) => (
            <td key={j}>
              <span className="ll-skel" />
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}
