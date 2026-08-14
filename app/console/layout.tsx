import type { Metadata } from 'next'
import '@/features/console/console.css'

export const metadata: Metadata = {
  title: 'LankaLux Admin Console',
}

export default function ConsoleGroupLayout({ children }: { children: React.ReactNode }) {
  return children
}
