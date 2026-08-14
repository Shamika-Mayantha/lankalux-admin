import { Be_Vietnam_Pro, Open_Sans } from 'next/font/google'
import type { Metadata } from 'next'
import { BrandDocument } from '@/features/console/BrandDocument'

const display = Be_Vietnam_Pro({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--ll-font-display',
  display: 'swap',
})

const body = Open_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  style: ['normal', 'italic'],
  variable: '--ll-font-body',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'LankaLux Journey',
  icons: {
    icon: [
      { url: '/brand/lankalux-favicon.ico', sizes: 'any' },
      { url: '/brand/lankalux-favicon.png', type: 'image/png' },
    ],
  },
}

export default function JourneyLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`journey-fonts ${display.variable} ${body.variable}`}>
      <BrandDocument />
      {children}
    </div>
  )
}
