import '@/features/journey/journey.css'
import { BRAND } from '@/config/brand'
import { appUrl, publicJourneyUrl } from '@/config/env'
import { JourneyStory } from '@/features/journey/JourneyStory'
import { getClientItinerary } from '@/services/itinerary.service'
import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ token: string }>; searchParams?: Promise<{ view?: string }> }

function shareImage() {
  return {
    url: `${appUrl()}${BRAND.shareImageSrc}`,
    alt: 'LankaLux — Private journeys, exceptional care',
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const image = shareImage()
  try {
    const { token } = await params
    const journey = await getClientItinerary(token, { trackOpen: false })
    const title = `${journey.title} · LankaLux`
    const description = journey.summary || BRAND.tagline
    const url = `${publicJourneyUrl()}/journey/${token}`
    return {
      title,
      description,
      metadataBase: new URL(publicJourneyUrl()),
      openGraph: {
        title,
        description,
        url,
        siteName: 'LankaLux',
        type: 'website',
        images: [image],
      },
      twitter: {
        card: 'summary_large_image',
        title,
        description,
        images: [image.url],
      },
    }
  } catch {
    return {
      title: 'LankaLux Journey',
      description: BRAND.tagline,
      metadataBase: new URL(publicJourneyUrl()),
      openGraph: {
        title: 'LankaLux Journey',
        description: BRAND.tagline,
        siteName: 'LankaLux',
        type: 'website',
        images: [image],
      },
      twitter: {
        card: 'summary_large_image',
        title: 'LankaLux Journey',
        description: BRAND.tagline,
        images: [image.url],
      },
    }
  }
}

export default async function PublicJourneyPage({ params, searchParams }: Props) {
  const { token } = await params
  const view = (await searchParams)?.view
  let journey = null as Awaited<ReturnType<typeof getClientItinerary>> | null
  let message = ''
  try {
    journey = await getClientItinerary(token, { trackOpen: true })
  } catch (err) {
    message = err instanceof Error ? err.message : 'This journey could not be found.'
  }

  if (!journey) {
    return (
      <div className="journey-root">
        <header className="journey-hero">
          <img src={BRAND.logoSrc} alt="LankaLux" className="journey-logo" />
          <h1 className="journey-title">Journey unavailable</h1>
          <p className="journey-summary">{message}</p>
        </header>
      </div>
    )
  }

  return <JourneyStory journey={journey} view={view} />
}
