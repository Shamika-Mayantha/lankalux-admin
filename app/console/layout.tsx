import type { Metadata } from 'next'
import { Be_Vietnam_Pro, Open_Sans } from 'next/font/google'
import { BrandDocument } from '@/features/console/BrandDocument'
import { BRAND } from '@/config/brand'
import '@/features/console/console.css'

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
  title: 'LankaLux Admin Console',
  icons: {
    icon: [
      { url: BRAND.shareImageSrc, type: 'image/png' },
      { url: '/brand/lankalux-favicon.ico', sizes: 'any' },
    ],
    apple: BRAND.shareImageSrc,
  },
}

export default function ConsoleGroupLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`ll-root ${display.variable} ${body.variable}`}>
      <BrandDocument />
      {children}
    </div>
  )
}
