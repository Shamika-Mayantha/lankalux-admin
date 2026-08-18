import '@/features/journey/journey.css'
import { BRAND } from '@/config/brand'
import { JourneyView } from '@/features/journey/JourneyView'
import { getClientItinerary } from '@/services/itinerary.service'
import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ token: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const { token } = await params
    const journey = await getClientItinerary(token)
    return { title: `${journey.title} · LankaLux`, description: journey.summary }
  } catch {
    return { title: 'LankaLux Journey' }
  }
}

export default async function PublicJourneyPage({ params }: Props) {
  const { token } = await params
  let journey = null as Awaited<ReturnType<typeof getClientItinerary>> | null
  let message = ''
  try {
    journey = await getClientItinerary(token)
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

  return <JourneyView journey={journey} showDistance={false} />
}
