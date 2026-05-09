'use client'

import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { getFleetVehicleById } from '@/lib/fleet'
import { ItineraryRender } from '@/components/itinerary/ItineraryRender'

type Day = {
  day: number
  title: string
  location: string
  image?: string
  activities: string[]
  optional_activities?: string[]
  what_to_expect?: string
  date?: string
}

type ItineraryOption = {
  title: string
  summary: string
  days: Day[]
}

type PublicRequest = {
  id: string
  client_name: string | null
  start_date: string | null
  end_date: string | null
  duration: number | null
}

type SendOptions = {
  include_vehicle?: boolean
  include_price?: boolean
  price?: string | null
  vehicle_option?: { id: string; name: string; description: string; images: string[] } | null
}

export default function PublicSharedItineraryPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const editMode = searchParams?.get('edit') === '1'

  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [request, setRequest] = useState<PublicRequest | null>(null)
  const [itinerary, setItinerary] = useState<ItineraryOption | null>(null)
  const [sendOptions, setSendOptions] = useState<SendOptions | null>(null)

  useEffect(() => {
    const share = (params as any)?.share as string
    if (!share) return

    const run = async () => {
      try {
        setLoading(true)
        const res = await fetch(`/api/public-itinerary-share?share=${encodeURIComponent(share)}`)
        if (!res.ok) {
          setNotFound(true)
          setLoading(false)
          return
        }
        const data = await res.json()
        if (!data?.request || !data?.itinerary) {
          setNotFound(true)
          setLoading(false)
          return
        }
        setRequest(data.request)
        setItinerary(data.itinerary)
        setSendOptions(data.send_options || null)
        setLoading(false)
      } catch {
        setNotFound(true)
        setLoading(false)
      }
    }

    void run()
  }, [params])

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#c8a45d] mb-4"></div>
          <p className="text-gray-600">Loading your itinerary...</p>
        </div>
      </div>
    )
  }

  if (notFound || !request || !itinerary) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <h1 className="text-3xl font-bold text-[#c8a45d] mb-4 font-serif">Itinerary Not Found</h1>
          <p className="text-gray-600 mb-6">The itinerary link is invalid or no longer available.</p>
        </div>
      </div>
    )
  }

  const vehicle =
    sendOptions?.include_vehicle && sendOptions?.vehicle_option
      ? (sendOptions.vehicle_option.id
          ? getFleetVehicleById(sendOptions.vehicle_option.id) ?? sendOptions.vehicle_option
          : sendOptions.vehicle_option)
      : null

  // Shared links are meant to be stable; we intentionally keep them read-only even if `edit=1` is present.
  // Editing still happens via the preview workflow on the admin side.
  if (editMode) {
    // no-op: keep read-only rendering for shared links
  }

  return (
    <ItineraryRender
      mode="link"
      clientName={request.client_name || 'Valued Client'}
      startDate={request.start_date}
      endDate={request.end_date}
      duration={request.duration}
      itinerary={itinerary}
      vehicle={vehicle ? { name: vehicle.name, description: vehicle.description, images: vehicle.images || [] } : null}
      price={sendOptions?.include_price ? sendOptions?.price ?? null : null}
    />
  )
}

