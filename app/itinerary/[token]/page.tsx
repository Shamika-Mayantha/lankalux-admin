'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'

interface Day {
  day: number
  title: string
  location: string
  activities: string[]
}

interface ItineraryOption {
  title: string
  summary: string
  days: Day[]
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
  itineraryoptions: string | null
  itinerary_options?: ItineraryOptions | null
  selected_option: number | null
}

// Location image mapping
const locationImages: Record<string, string> = {
  "Colombo": "/images/colombo.jpg",
  "Sigiriya": "/images/sigiriya.jpg",
  "Ella": "/images/ella.jpg",
  "Yala": "/images/yala.jpg",
  "Galle": "/images/galle.jpg",
  "Kandy": "/images/kandy.jpg",
  "Nuwara Eliya": "/images/nuwara-eliya.jpg"
}

// Location descriptions for "About Your Destinations" section
const locationDescriptions: Record<string, string> = {
  "Colombo": "Sri Lanka's vibrant capital city, where colonial architecture meets modern luxury. Experience world-class dining, shopping, and cultural attractions in this cosmopolitan hub.",
  "Sigiriya": "The ancient rock fortress, a UNESCO World Heritage site rising dramatically from the plains. Discover the legendary 'Lion Rock' with its stunning frescoes and breathtaking views.",
  "Ella": "A charming hill country town surrounded by tea plantations and misty mountains. Perfect for hiking, train journeys, and experiencing authentic Sri Lankan tea culture.",
  "Yala": "Sri Lanka's premier wildlife sanctuary, home to leopards, elephants, and diverse birdlife. Experience thrilling safaris in one of the world's best national parks.",
  "Galle": "A historic fortified city with Dutch colonial architecture, cobblestone streets, and stunning ocean views. A perfect blend of history, culture, and coastal beauty.",
  "Kandy": "The cultural heart of Sri Lanka, home to the sacred Temple of the Tooth Relic. Surrounded by hills and lakes, offering spiritual experiences and natural beauty.",
  "Nuwara Eliya": "Known as 'Little England' for its cool climate and colonial charm. Surrounded by tea estates, waterfalls, and mountain peaks, offering a refreshing escape."
}

export default function PublicItineraryPage() {
  const params = useParams()
  const [request, setRequest] = useState<Request | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [selectedItinerary, setSelectedItinerary] = useState<ItineraryOption | null>(null)

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
          .select('id, client_name, start_date, end_date, duration, itineraryoptions, selected_option')
          .eq('public_token', token)
          .single()

        if (error || !data) {
          console.error('Error fetching itinerary:', error)
          setNotFound(true)
          setLoading(false)
          return
        }

        const requestData = data as any

        // Parse itineraryoptions string to object if it exists
        if (requestData.itineraryoptions && typeof requestData.itineraryoptions === 'string') {
          try {
            requestData.itinerary_options = JSON.parse(requestData.itineraryoptions)
          } catch (parseError) {
            console.error('Error parsing itineraryoptions:', parseError)
            requestData.itinerary_options = null
          }
        } else {
          requestData.itinerary_options = null
        }

        if (!requestData.itinerary_options || requestData.selected_option === null || requestData.selected_option === undefined) {
          setNotFound(true)
          setLoading(false)
          return
        }

        // Get selected itinerary option
        const selectedOption = requestData.itinerary_options.options?.[requestData.selected_option]
        if (!selectedOption) {
          setNotFound(true)
          setLoading(false)
          return
        }

        setRequest(requestData)
        setSelectedItinerary(selectedOption)
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

  const handlePrint = () => {
    window.print()
  }

  const getLocationImage = (location: string): string => {
    return locationImages[location] || "/images/placeholder.jpg"
  }

  const getUniqueLocations = (): string[] => {
    if (!selectedItinerary) return []
    const locations = selectedItinerary.days.map(day => day.location)
    return Array.from(new Set(locations))
  }

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

  if (notFound || !request || !selectedItinerary) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <h1 className="text-3xl font-bold text-[#c8a45d] mb-4 font-serif">Itinerary Not Found</h1>
          <p className="text-gray-600 mb-6">
            The itinerary you're looking for doesn't exist or the link is invalid.
          </p>
        </div>
      </div>
    )
  }

  const uniqueLocations = getUniqueLocations()

  return (
    <>
      <style jsx global>{`
        @media print {
          .no-print {
            display: none !important;
          }
          body {
            background: white !important;
          }
          .print-shadow {
            box-shadow: none !important;
          }
          .print-full-width {
            max-width: 100% !important;
            padding: 0 !important;
          }
        }
      `}</style>
      <div className="min-h-screen bg-white">
        {/* Print Button */}
        <div className="no-print fixed top-6 right-6 z-50">
          <button
            onClick={handlePrint}
            className="bg-[#c8a45d] hover:bg-[#b8944d] text-white font-semibold px-6 py-3 rounded-md shadow-lg transition-all duration-200 hover:shadow-xl"
          >
            Print Itinerary
          </button>
        </div>

        {/* Hero Section */}
        <div className="bg-gradient-to-b from-[#fafafa] to-white py-16 border-b-2 border-[#c8a45d]">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <div className="mb-8">
              <img 
                src="/favicon.png" 
                alt="LankaLux Logo" 
                className="h-20 w-20 object-contain mx-auto mb-6"
              />
            </div>
            <h1 className="text-5xl font-serif font-bold text-[#2c2c2c] mb-4">
              {selectedItinerary.title}
            </h1>
            <div className="w-24 h-1 bg-[#c8a45d] mx-auto mb-8"></div>
            <p className="text-xl text-gray-600 mb-2 font-serif">
              Prepared for
            </p>
            <h2 className="text-3xl font-serif font-semibold text-[#2c2c2c] mb-8">
              {request.client_name || 'Valued Client'}
            </h2>
            <div className="flex flex-wrap justify-center gap-8 text-gray-600">
              {request.start_date && (
                <div>
                  <span className="text-sm uppercase tracking-wide text-gray-500">Start Date</span>
                  <p className="text-lg font-semibold text-[#2c2c2c] mt-1">{formatDate(request.start_date)}</p>
                </div>
              )}
              {request.end_date && (
                <div>
                  <span className="text-sm uppercase tracking-wide text-gray-500">End Date</span>
                  <p className="text-lg font-semibold text-[#2c2c2c] mt-1">{formatDate(request.end_date)}</p>
                </div>
              )}
              {request.duration && (
                <div>
                  <span className="text-sm uppercase tracking-wide text-gray-500">Duration</span>
                  <p className="text-lg font-semibold text-[#2c2c2c] mt-1">{request.duration} Days</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Summary Section */}
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="bg-[#fafafa] border-l-4 border-[#c8a45d] p-8 rounded-r-lg">
            <p className="text-lg text-gray-700 leading-relaxed font-serif">
              {selectedItinerary.summary}
            </p>
          </div>
        </div>

        {/* Day Cards */}
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
          <h2 className="text-3xl font-serif font-bold text-[#2c2c2c] mb-12 text-center">
            Your Journey
          </h2>
          <div className="space-y-12">
            {selectedItinerary.days.map((day, index) => {
              const imagePath = getLocationImage(day.location)
              return (
                <div key={index} className="print-shadow">
                  {/* Location Image */}
                  <div className="mb-6 rounded-lg overflow-hidden">
                    <img 
                      src={imagePath}
                      alt={day.location}
                      className="w-full h-64 object-cover"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement
                        target.src = "/images/placeholder.jpg"
                      }}
                    />
                  </div>
                  
                  {/* Day Card */}
                  <div className="bg-white border-2 border-[#c8a45d] rounded-lg p-8 shadow-lg print-shadow">
                    <div className="mb-6">
                      <h3 className="text-3xl font-serif font-bold text-[#2c2c2c] mb-2">
                        Day {day.day} – {day.title}
                      </h3>
                      <p className="text-lg text-[#c8a45d] font-semibold uppercase tracking-wide">
                        {day.location}
                      </p>
                    </div>
                    
                    <div className="border-t border-gray-200 pt-6">
                      <h4 className="text-lg font-semibold text-[#2c2c2c] mb-4 font-serif">
                        Activities
                      </h4>
                      <ul className="space-y-3">
                        {day.activities.map((activity, actIndex) => (
                          <li key={actIndex} className="flex items-start">
                            <span className="text-[#c8a45d] mr-3 mt-1">•</span>
                            <span className="text-gray-700 leading-relaxed">{activity}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* About Your Destinations Section */}
        {uniqueLocations.length > 0 && (
          <div className="bg-[#fafafa] py-16">
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
              <h2 className="text-3xl font-serif font-bold text-[#2c2c2c] mb-12 text-center">
                About Your Destinations
              </h2>
              <div className="space-y-8">
                {uniqueLocations.map((location, index) => {
                  const description = locationDescriptions[location] || `${location} offers unique experiences and cultural insights as part of your luxury Sri Lanka journey.`
                  return (
                    <div key={index} className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
                      <h3 className="text-2xl font-serif font-semibold text-[#2c2c2c] mb-3">
                        {location}
                      </h3>
                      <p className="text-gray-700 leading-relaxed font-serif">
                        {description}
                      </p>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <footer className="bg-[#2c2c2c] text-white py-12">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <p className="text-sm text-gray-400 mb-2">
              © {new Date().getFullYear()} LankaLux. All rights reserved.
            </p>
            <p className="text-sm text-gray-500">
              For inquiries, please contact your travel consultant.
            </p>
          </div>
        </footer>
      </div>
    </>
  )
}
