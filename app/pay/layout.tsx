import localFont from 'next/font/local'
import type { Metadata } from 'next'
import { BrandDocument } from '@/features/console/BrandDocument'
import { BRAND } from '@/config/brand'
import { publicJourneyUrl } from '@/config/env'

// Same lankalux.com faces as the journey story, so the pay page reads as one brand.
const gambetta = localFont({
  src: [
    { path: '../itinerary/fonts/Gambetta-Variable.woff2', style: 'normal', weight: '300 700' },
    { path: '../itinerary/fonts/Gambetta-VariableItalic.woff2', style: 'italic', weight: '300 700' },
  ],
  variable: '--font-gambetta',
  display: 'swap',
  fallback: ['Times New Roman', 'serif'],
})

const switzer = localFont({
  src: [{ path: '../itinerary/fonts/Switzer-Variable.woff2', style: 'normal', weight: '100 900' }],
  variable: '--font-switzer',
  display: 'swap',
  fallback: ['system-ui', 'Arial', 'sans-serif'],
})

export const metadata: Metadata = {
  title: 'Secure payment · LankaLux',
  description: BRAND.tagline,
  metadataBase: new URL(publicJourneyUrl()),
  robots: { index: false, follow: false },
  icons: {
    icon: [
      { url: BRAND.shareImageSrc, type: 'image/png' },
      { url: '/brand/lankalux-favicon.ico', sizes: 'any' },
    ],
    apple: BRAND.shareImageSrc,
  },
}

export default function PayLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`ll-pay-fonts ${gambetta.variable} ${switzer.variable}`}>
      <BrandDocument />
      {children}
    </div>
  )
}
