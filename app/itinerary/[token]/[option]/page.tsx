'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'

interface Day {
  day: number
  title: string
  location: string
  image?: string
  activities: string[]
  optional_activities?: string[]
  what_to_expect?: string
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

// Location image mapping (using actual file names that exist)
const locationImages: Record<string, string> = {
  "Colombo": "/images/arrivalincolombo.jpg",
  "Sigiriya": "/images/sigirya.jpg",
  "Ella": "/images/damrotea.jpg",
  "Yala": "/images/leopard.jpg",
  "Galle": "/images/galle.jpg",
  "Kandy": "/images/kandy.jpg",
  "Nuwara Eliya": "/images/damrotea.jpg"
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
  const [showContactModal, setShowContactModal] = useState(false)
  const [contactName, setContactName] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [contactMessage, setContactMessage] = useState('')

  useEffect(() => {
    const fetchItinerary = async () => {
      try {
        setLoading(true)
        // Access params - in Next.js App Router, nested dynamic routes use the folder name as the key
        let token = params?.token as string || (params as any)?.token || ''
        let optionParam = params?.option as string || (params as any)?.option || ''

        // Fallback: Parse from URL pathname if params are not available (mobile browsers sometimes have issues)
        if (!token || !optionParam) {
          if (typeof window !== 'undefined') {
            const pathParts = window.location.pathname.split('/').filter(Boolean)
            // Path should be: /itinerary/[token]/[option]
            if (pathParts.length >= 3 && pathParts[0] === 'itinerary') {
              token = token || pathParts[1] || ''
              optionParam = optionParam || pathParts[2] || ''
            }
          }
        }

        console.log('Itinerary page params:', { 
          token, 
          optionParam, 
          allParams: params,
          paramsKeys: Object.keys(params || {}),
          pathname: typeof window !== 'undefined' ? window.location.pathname : 'N/A'
        })

        if (!token) {
          console.error('No token found in URL')
          setNotFound(true)
          setLoading(false)
          return
        }

        // Parse option index from URL parameter
        const optionIndex = optionParam ? parseInt(optionParam, 10) : null
        if (optionIndex === null || isNaN(optionIndex)) {
          console.error('Invalid option index:', optionParam, 'from pathname:', typeof window !== 'undefined' ? window.location.pathname : 'N/A')
          setNotFound(true)
          setLoading(false)
          return
        }

        console.log('Fetching itinerary with token:', token, 'option:', optionIndex)

        // Use public API endpoint to bypass RLS and allow unauthenticated access
        const apiUrl = `/api/public-itinerary?token=${encodeURIComponent(token)}&option=${encodeURIComponent(optionIndex)}`
        const response = await fetch(apiUrl)

        if (!response.ok) {
          console.error('Error fetching itinerary from API:', response.status, response.statusText)
          setNotFound(true)
          setLoading(false)
          return
        }

        const apiData = await response.json()
        const requestData = apiData.request
        const selectedItineraryOption = apiData.itinerary

        if (!requestData || !selectedItineraryOption) {
          console.error('No data found for token:', token, 'option:', optionIndex)
          setNotFound(true)
          setLoading(false)
          return
        }

        console.log('Request data found:', { 
          id: requestData.id, 
          hasItinerary: !!selectedItineraryOption,
          selectedOption: requestData.selected_option
        })

        console.log('Successfully loaded itinerary option:', selectedItineraryOption.title)
        setRequest(requestData)
        setSelectedItinerary(selectedItineraryOption)
        setLoading(false)
      } catch (err) {
        console.error('Unexpected error fetching itinerary:', err)
        setNotFound(true)
        setLoading(false)
      }
    }

    fetchItinerary()
  }, [params])

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

  const handleWhatsAppClick = () => {
    if (!selectedItinerary) return
    
    const itineraryTitle = selectedItinerary.title
    const clientName = request?.client_name || 'Valued Client'
    const startDate = request?.start_date ? formatDate(request.start_date) : 'TBD'
    const endDate = request?.end_date ? formatDate(request.end_date) : 'TBD'
    
    const message = encodeURIComponent(
      `Hello! I'm interested in this itinerary:\n\n` +
      `📋 *${itineraryTitle}*\n` +
      `👤 Prepared for: ${clientName}\n` +
      `📅 Travel Dates: ${startDate} to ${endDate}\n\n` +
      `I'd like to know more about this itinerary. Could you please provide more details?`
    )
    
    // WhatsApp number - update this with your business number (format: country code + number without +)
    // Example: 94771234567 for Sri Lanka
    const whatsappNumber = '94763261788'
    window.open(`https://wa.me/${whatsappNumber}?text=${message}`, '_blank')
  }

  const handleContactSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!selectedItinerary) return
    
    const itineraryTitle = selectedItinerary.title
    const clientName = request?.client_name || 'Valued Client'
    const startDate = request?.start_date ? formatDate(request.start_date) : 'TBD'
    const endDate = request?.end_date ? formatDate(request.end_date) : 'TBD'
    
    let message = `Hello! I'm interested in this itinerary:\n\n`
    message += `📋 *${itineraryTitle}*\n`
    message += `👤 Prepared for: ${clientName}\n`
    message += `📅 Travel Dates: ${startDate} to ${endDate}\n\n`
    
    if (contactName) message += `👤 My Name: ${contactName}\n`
    if (contactEmail) message += `📧 My Email: ${contactEmail}\n`
    if (contactMessage) message += `\n💬 My Message:\n${contactMessage}\n`
    
    // WhatsApp number - update this with your business number (format: country code + number without +)
    // Example: 94771234567 for Sri Lanka
    const whatsappNumber = '94763261788'
    window.open(`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`, '_blank')
    
    // Reset form and close modal
    setContactName('')
    setContactEmail('')
    setContactMessage('')
    setShowContactModal(false)
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
        <div className="no-print fixed top-6 right-6 z-50 flex gap-3">
          <button
            onClick={handlePrint}
            className="bg-[#c8a45d] hover:bg-[#b8944d] text-white font-semibold px-6 py-3 rounded-md shadow-lg transition-all duration-200 hover:shadow-xl"
          >
            Print Itinerary
          </button>
        </div>

        {/* Contact Button */}
        <div className="no-print fixed bottom-6 right-6 z-50">
          <button
            onClick={() => setShowContactModal(true)}
            className="bg-[#25D366] hover:bg-[#20BA5A] text-white font-semibold px-6 py-4 rounded-full shadow-2xl transition-all duration-200 hover:shadow-[#25D366]/50 flex items-center gap-3 animate-bounce"
            style={{ animation: 'bounce 2s infinite' }}
          >
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
            </svg>
            <span>Contact Us</span>
          </button>
        </div>

        {/* Contact Modal */}
        {showContactModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-2xl max-w-md w-full p-6 relative">
              <button
                onClick={() => setShowContactModal(false)}
                className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-2xl"
              >
                ×
              </button>
              
              <h2 className="text-2xl font-serif font-bold text-[#2c2c2c] mb-2">
                Contact Us About This Itinerary
              </h2>
              <p className="text-gray-600 mb-6">
                <span className="font-semibold text-[#c8a45d]">{selectedItinerary.title}</span>
              </p>
              
              <form onSubmit={handleContactSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Your Name
                  </label>
                  <input
                    type="text"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#c8a45d]"
                    placeholder="Enter your name"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#c8a45d]"
                    placeholder="Enter your email"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Message (Optional)
                  </label>
                  <textarea
                    value={contactMessage}
                    onChange={(e) => setContactMessage(e.target.value)}
                    rows={4}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#c8a45d]"
                    placeholder="Any questions or special requests?"
                  />
                </div>
                
                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowContactModal(false)}
                    className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 px-4 py-2 bg-[#25D366] hover:bg-[#20BA5A] text-white rounded-md font-semibold transition-colors flex items-center justify-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                    </svg>
                    Send via WhatsApp
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

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
              return (
                <div key={index} className="print-shadow">
                  {/* Day Image - Show if available */}
                  {day.image && (
                    <div className="mb-6 rounded-lg overflow-hidden">
                      <img 
                        src={day.image}
                        alt={day.title || day.location}
                        className="w-full h-64 object-cover"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement
                          // Hide image if it fails to load
                          target.style.display = 'none'
                        }}
                      />
                    </div>
                  )}
                  
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
                    
                    {day.what_to_expect && (
                      <div className="border-t border-gray-200 pt-6 mb-6">
                        <h4 className="text-lg font-semibold text-[#2c2c2c] mb-3 font-serif">
                          What to Expect
                        </h4>
                        <p className="text-gray-700 leading-relaxed font-serif italic">
                          {day.what_to_expect}
                        </p>
                      </div>
                    )}
                    
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
                    
                    {day.optional_activities && day.optional_activities.length > 0 && (
                      <div className="border-t border-gray-200 pt-6 mt-6">
                        <h4 className="text-lg font-semibold text-[#2c2c2c] mb-4 font-serif">
                          Optional Activities
                        </h4>
                        <p className="text-sm text-gray-600 mb-3 italic">
                          If time allows, you can do these activities optionally
                        </p>
                        <ul className="space-y-3">
                          {day.optional_activities.map((activity, actIndex) => (
                            <li key={actIndex} className="flex items-start">
                              <span className="text-[#c8a45d] mr-3 mt-1">+</span>
                              <span className="text-gray-700 leading-relaxed">{activity}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
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
