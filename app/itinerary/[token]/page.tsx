'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'

interface ItineraryOption {
  title: string
  days: string
  summary: string
}

interface ItineraryOptions {
  options: ItineraryOption[]
}

interface Request {
  id: string
  client_name: string | null
  start_date: string | null
  end_date: string | null
  duration: number | null
  itinerary_options: ItineraryOptions | null
  selected_option: number | null
}

export default function PublicItineraryPage() {
  const params = useParams()
  const [request, setRequest] = useState<Request | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    const fetchItinerary = async () => {
      try {
        setLoading(true)
        const token = params.token as string

        if (!token) {
          setNotFound(true)
          setLoading(false)
          return
        }

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
        const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        const supabase = createClient(supabaseUrl, supabaseAnonKey)

        const { data, error } = await supabase
          .from('requests')
          .select('id, client_name, start_date, end_date, duration, itinerary_options, selected_option')
          .eq('public_token', token)
          .single()

        if (error || !data) {
          console.error('Error fetching itinerary:', error)
          setNotFound(true)
          setLoading(false)
          return
        }

        if (!data.itinerary_options || data.selected_option === null) {
          setNotFound(true)
          setLoading(false)
          return
        }

        setRequest(data as any)
        setLoading(false)
      } catch (err) {
        console.error('Unexpected error fetching itinerary:', err)
        setNotFound(true)
        setLoading(false)
      }
    }

    fetchItinerary()
  }, [params.token])

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A'
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    } catch {
      return dateString
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#d4af37] mb-4"></div>
          <p className="text-gray-400">Loading your itinerary...</p>
        </div>
      </div>
    )
  }

  if (notFound || !request) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <h1 className="text-3xl font-bold text-[#d4af37] mb-4">Itinerary Not Found</h1>
          <p className="text-gray-400 mb-6">
            The itinerary you're looking for doesn't exist or the link is invalid.
          </p>
        </div>
      </div>
    )
  }

  const selectedOption = request.itinerary_options?.options[request.selected_option!]

  if (!selectedOption) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <h1 className="text-3xl font-bold text-[#d4af37] mb-4">Itinerary Not Available</h1>
          <p className="text-gray-400 mb-6">
            The selected itinerary option is not available.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black">
      {/* Header */}
      <header className="border-b border-[#333] bg-[#1a1a1a]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center">
            <h1 className="text-4xl font-bold text-[#d4af37] mb-2">LankaLux</h1>
            <p className="text-gray-400 text-lg">Your Personalized Sri Lanka Itinerary</p>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Client Info */}
        <div className="mb-8 text-center">
          <p className="text-gray-400 mb-2">Prepared for</p>
          <h2 className="text-2xl font-semibold text-white mb-6">
            {request.client_name || 'Valued Client'}
          </h2>
          <div className="flex flex-wrap justify-center gap-6 text-sm text-gray-400">
            {request.start_date && (
              <div>
                <span className="text-gray-500">Start:</span>{' '}
                <span className="text-white">{formatDate(request.start_date)}</span>
              </div>
            )}
            {request.end_date && (
              <div>
                <span className="text-gray-500">End:</span>{' '}
                <span className="text-white">{formatDate(request.end_date)}</span>
              </div>
            )}
            {request.duration && (
              <div>
                <span className="text-gray-500">Duration:</span>{' '}
                <span className="text-white">{request.duration} days</span>
              </div>
            )}
          </div>
        </div>

        {/* Itinerary Card */}
        <div className="bg-[#1a1a1a] border border-[#333] rounded-lg p-8 md:p-10">
          <div className="mb-6">
            <h3 className="text-3xl font-bold text-[#d4af37] mb-4">
              {selectedOption.title}
            </h3>
            <p className="text-gray-300 text-lg leading-relaxed">
              {selectedOption.summary}
            </p>
          </div>

          <div className="border-t border-[#333] pt-6">
            <h4 className="text-xl font-semibold text-[#d4af37] mb-4">Day-by-Day Itinerary</h4>
            <div className="bg-[#0a0a0a] border border-[#333] rounded-md p-6">
              <div className="text-gray-300 whitespace-pre-wrap leading-relaxed">
                {selectedOption.days}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="mt-12 text-center text-gray-500 text-sm">
          <p>© {new Date().getFullYear()} LankaLux. All rights reserved.</p>
          <p className="mt-2">For inquiries, please contact your travel consultant.</p>
        </footer>
      </main>
    </div>
  )
}
