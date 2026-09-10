import { Be_Vietnam_Pro, Open_Sans } from 'next/font/google'
import type { Metadata } from 'next'
import { BrandDocument } from '@/features/console/BrandDocument'
import { BRAND } from '@/config/brand'
import { appUrl, publicJourneyUrl } from '@/config/env'

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
  description: BRAND.tagline,
  metadataBase: new URL(publicJourneyUrl()),
  icons: {
    icon: [
      { url: BRAND.shareImageSrc, type: 'image/png' },
      { url: '/brand/lankalux-favicon.ico', sizes: 'any' },
    ],
    apple: BRAND.shareImageSrc,
  },
  openGraph: {
    siteName: 'LankaLux',
    images: [{ url: `${appUrl()}${BRAND.shareImageSrc}`, alt: 'LankaLux — Private journeys, exceptional care' }],
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
