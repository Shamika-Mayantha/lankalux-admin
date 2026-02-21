'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface Request {
  id: string
  client_name: string | null
  email: string | null
  whatsapp: string | null
  travel_dates: string | null
  duration: string | null
  origin_country: string | null
  details: string | null
  status: string | null
  itinerary: string | null
  created_at: string
}

export default function RequestDetailsPage() {
  const params = useParams()
  const router = useRouter()
  const [request, setRequest] = useState<Request | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [itinerary, setItinerary] = useState<string | null>(null)
  const [editingItinerary, setEditingItinerary] = useState<string>('')
  const [isEditing, setIsEditing] = useState(false)
  const [generatingItinerary, setGeneratingItinerary] = useState(false)
  const [savingItinerary, setSavingItinerary] = useState(false)

  useEffect(() => {
    const fetchRequest = async () => {
      try {
        setLoading(true)
        const id = params.id as string

        if (!id) {
          setNotFound(true)
          setLoading(false)
          return
        }

        const { data, error } = await supabase
          .from('requests')
          .select('*')
          .eq('id', id)
          .single()

        if (error) {
          console.error('Error fetching request:', error)
          setNotFound(true)
          setLoading(false)
          return
        }

        if (!data) {
          setNotFound(true)
          setLoading(false)
          return
        }

        const requestData = data as any

        setRequest(requestData)
        setItinerary(requestData.itinerary || null)
        setEditingItinerary(requestData.itinerary || '')
        setLoading(false)
      } catch (err) {
        console.error('Unexpected error fetching request:', err)
        setNotFound(true)
        setLoading(false)
      }
    }

    fetchRequest()
  }, [params.id])

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A'
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch {
      return dateString
    }
  }

  const getStatusColor = (status: string | null) => {
    if (!status) return 'text-gray-400'
    const statusLower = status.toLowerCase()
    if (statusLower === 'pending') return 'text-yellow-400'
    if (statusLower === 'approved' || statusLower === 'confirmed') return 'text-green-400'
    if (statusLower === 'rejected' || statusLower === 'cancelled') return 'text-red-400'
    return 'text-gray-400'
  }

  const getStatusBgColor = (status: string | null) => {
    if (!status) return 'bg-gray-800'
    const statusLower = status.toLowerCase()
    if (statusLower === 'pending') return 'bg-yellow-900/30'
    if (statusLower === 'approved' || statusLower === 'confirmed') return 'bg-green-900/30'
    if (statusLower === 'rejected' || statusLower === 'cancelled') return 'bg-red-900/30'
    return 'bg-gray-800'
  }

  const generateSampleItineraries = () => {
    const option1 = `OPTION 1: CLASSIC SRI LANKA TOUR

Day 1: Arrival in Colombo
- Airport pickup and transfer to hotel
- Welcome dinner at a local restaurant
- Overnight in Colombo

Day 2: Colombo City Tour → Kandy
- Morning city tour of Colombo
- Visit Gangaramaya Temple
- Drive to Kandy (3 hours)
- Evening: Cultural show with traditional dance
- Overnight in Kandy

Day 3: Kandy → Nuwara Eliya
- Visit Temple of the Sacred Tooth Relic
- Royal Botanical Gardens
- Scenic train ride to Nuwara Eliya
- Overnight in Nuwara Eliya

Day 4: Nuwara Eliya → Yala
- Visit tea plantations
- Drive to Yala National Park
- Evening safari (if time permits)
- Overnight near Yala

Day 5: Yala → Galle
- Morning safari in Yala National Park
- Drive to Galle (4 hours)
- Explore Galle Fort
- Overnight in Galle

Day 6: Galle → Departure
- Beach time in Unawatuna
- Transfer to airport for departure`

    const option2 = `OPTION 2: ADVENTURE & NATURE TOUR

Day 1: Arrival in Colombo
- Airport pickup and transfer
- Briefing session
- Overnight in Colombo

Day 2: Colombo → Sigiriya
- Early morning drive to Sigiriya (5 hours)
- Afternoon: Climb Sigiriya Rock Fortress
- Visit Dambulla Cave Temple
- Overnight in Sigiriya

Day 3: Sigiriya → Kandy
- Morning: Minneriya National Park safari
- Drive to Kandy
- Visit Spice Garden
- Overnight in Kandy

Day 4: Kandy → Ella
- Scenic train journey to Ella (one of the world's most beautiful train rides)
- Visit Nine Arch Bridge
- Hiking to Little Adam's Peak
- Overnight in Ella

Day 5: Ella → Mirissa
- Drive to Mirissa
- Whale watching tour (seasonal)
- Beach relaxation
- Overnight in Mirissa

Day 6: Mirissa → Galle → Departure
- Visit Galle Fort
- Beach activities
- Transfer to airport for departure`

    return `${option1}\n\n${'='.repeat(60)}\n\n${option2}`
  }

  const handleGenerateItinerary = async () => {
    if (!request) return

    try {
      setGeneratingItinerary(true)
      
      // Generate 2 sample itinerary options
      const generatedItinerary = generateSampleItineraries()

      // Save to Supabase
      const { error } = await supabase
        .from('requests')
        .update({ itinerary: generatedItinerary } as any)
        .eq('id', request.id)

      if (error) {
        console.error('Error saving itinerary:', error)
        alert('Failed to save itinerary. Please try again.')
        setGeneratingItinerary(false)
        return
      }

      // Update local state
      setItinerary(generatedItinerary)
      setEditingItinerary(generatedItinerary)
      setRequest({ ...request, itinerary: generatedItinerary })
      setGeneratingItinerary(false)
    } catch (err) {
      console.error('Unexpected error generating itinerary:', err)
      alert('An unexpected error occurred. Please try again.')
      setGeneratingItinerary(false)
    }
  }

  const handleSaveItinerary = async () => {
    if (!request) return

    try {
      setSavingItinerary(true)

      const { error } = await supabase
        .from('requests')
        .update({ itinerary: editingItinerary || null } as any)
        .eq('id', request.id)

      if (error) {
        console.error('Error updating itinerary:', error)
        alert('Failed to save changes. Please try again.')
        setSavingItinerary(false)
        return
      }

      // Update local state
      setItinerary(editingItinerary || null)
      setRequest({ ...request, itinerary: editingItinerary || null })
      setIsEditing(false)
      setSavingItinerary(false)
    } catch (err) {
      console.error('Unexpected error saving itinerary:', err)
      alert('An unexpected error occurred. Please try again.')
      setSavingItinerary(false)
    }
  }

  const handleEditItinerary = () => {
    setEditingItinerary(itinerary || '')
    setIsEditing(true)
  }

  const handleCancelEdit = () => {
    setEditingItinerary(itinerary || '')
    setIsEditing(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#d4af37] mb-4"></div>
          <p className="text-gray-400">Loading request details...</p>
        </div>
      </div>
    )
  }

  if (notFound || !request) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-[#d4af37] mb-4">Request not found</h1>
          <p className="text-gray-400 mb-6">The request you're looking for doesn't exist or has been removed.</p>
          <button
            onClick={() => router.push('/dashboard')}
            className="px-6 py-2 bg-[#d4af37] hover:bg-[#b8941f] text-black font-semibold rounded-md transition-colors duration-200"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => router.push('/dashboard')}
            className="mb-6 px-4 py-2 bg-[#333] hover:bg-[#444] text-white font-semibold rounded-md transition-colors duration-200 flex items-center gap-2"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 19l-7-7m0 0l7-7m-7 7h18"
              />
            </svg>
            Back to Dashboard
          </button>
          <h1 className="text-4xl font-bold text-[#d4af37] mb-2">
            Request Details
          </h1>
          <p className="text-gray-400">
            Request ID: <span className="text-gray-300 font-mono text-sm">{request.id}</span>
          </p>
        </div>

        {/* Request Details Card */}
        <div className="bg-[#1a1a1a] border border-[#333] rounded-lg p-6 md:p-8">
          <div className="space-y-6">
            {/* Status Badge */}
            <div className="flex items-center justify-between pb-6 border-b border-[#333]">
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Status</p>
                <span
                  className={`inline-block px-4 py-2 rounded-md font-semibold ${getStatusColor(request.status)} ${getStatusBgColor(request.status)} border border-current/20`}
                >
                  {request.status || 'Pending'}
                </span>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Created At</p>
                <p className="text-gray-300">{formatDate(request.created_at)}</p>
              </div>
            </div>

            {/* Client Information */}
            <div>
              <h2 className="text-2xl font-semibold text-[#d4af37] mb-4">Client Information</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Client Name</p>
                  <p className="text-white text-lg font-medium">
                    {request.client_name || 'N/A'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Email</p>
                  <p className="text-gray-300">
                    {request.email ? (
                      <a
                        href={`mailto:${request.email}`}
                        className="text-[#d4af37] hover:text-[#b8941f] transition-colors duration-200"
                      >
                        {request.email}
                      </a>
                    ) : (
                      'N/A'
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">WhatsApp</p>
                  <p className="text-gray-300">
                    {request.whatsapp ? (
                      <a
                        href={`https://wa.me/${request.whatsapp.replace(/[^0-9]/g, '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#d4af37] hover:text-[#b8941f] transition-colors duration-200"
                      >
                        {request.whatsapp}
                      </a>
                    ) : (
                      'N/A'
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Origin Country</p>
                  <p className="text-gray-300">{request.origin_country || 'N/A'}</p>
                </div>
              </div>
            </div>

            {/* Travel Information */}
            <div className="pt-6 border-t border-[#333]">
              <h2 className="text-2xl font-semibold text-[#d4af37] mb-4">Travel Information</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Travel Dates</p>
                  <p className="text-gray-300">{request.travel_dates || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Duration</p>
                  <p className="text-gray-300">{request.duration || 'N/A'}</p>
                </div>
              </div>
            </div>

            {/* Details */}
            {request.details && (
              <div className="pt-6 border-t border-[#333]">
                <h2 className="text-2xl font-semibold text-[#d4af37] mb-4">Additional Details</h2>
                <div className="bg-[#0a0a0a] border border-[#333] rounded-md p-4">
                  <p className="text-gray-300 whitespace-pre-wrap">{request.details}</p>
                </div>
              </div>
            )}

            {/* Itinerary Section */}
            <div className="pt-6 border-t border-[#333]">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-semibold text-[#d4af37]">Itinerary</h2>
                {!itinerary && !isEditing && (
                  <button
                    onClick={handleGenerateItinerary}
                    disabled={generatingItinerary}
                    className="px-4 py-2 bg-[#d4af37] hover:bg-[#b8941f] text-black font-semibold rounded-md transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {generatingItinerary ? (
                      <>
                        <div className="inline-block animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-black"></div>
                        Generating...
                      </>
                    ) : (
                      <>
                        <svg
                          className="w-5 h-5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 4v16m8-8H4"
                          />
                        </svg>
                        Generate Itinerary
                      </>
                    )}
                  </button>
                )}
              </div>

              {generatingItinerary && !itinerary ? (
                <div className="bg-[#0a0a0a] border border-[#333] rounded-md p-8">
                  <div className="text-center">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#d4af37] mb-4"></div>
                    <p className="text-gray-400">Generating itinerary options...</p>
                  </div>
                </div>
              ) : isEditing ? (
                <div className="space-y-4">
                  <textarea
                    value={editingItinerary}
                    onChange={(e) => setEditingItinerary(e.target.value)}
                    className="w-full h-96 bg-[#0a0a0a] border border-[#333] rounded-md p-4 text-gray-300 font-mono text-sm focus:outline-none focus:border-[#d4af37] transition-colors duration-200 resize-y"
                    placeholder="Enter itinerary details..."
                  />
                  <div className="flex gap-3">
                    <button
                      onClick={handleSaveItinerary}
                      disabled={savingItinerary}
                      className="px-6 py-2 bg-[#d4af37] hover:bg-[#b8941f] text-black font-semibold rounded-md transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {savingItinerary ? (
                        <>
                          <div className="inline-block animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-black"></div>
                          Saving...
                        </>
                      ) : (
                        'Save Changes'
                      )}
                    </button>
                    <button
                      onClick={handleCancelEdit}
                      disabled={savingItinerary}
                      className="px-6 py-2 bg-[#333] hover:bg-[#444] text-white font-semibold rounded-md transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : itinerary ? (
                <div className="space-y-4">
                  <div className="bg-[#0a0a0a] border border-[#333] rounded-md p-4">
                    <p className="text-gray-300 whitespace-pre-wrap font-mono text-sm">{itinerary}</p>
                  </div>
                  <button
                    onClick={handleEditItinerary}
                    className="px-4 py-2 bg-[#333] hover:bg-[#444] text-white font-semibold rounded-md transition-colors duration-200 flex items-center gap-2"
                  >
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                      />
                    </svg>
                    Edit Itinerary
                  </button>
                </div>
              ) : (
                <div className="bg-[#0a0a0a] border border-[#333] rounded-md p-8">
                  <p className="text-gray-400 text-center">No itinerary generated yet. Click "Generate Itinerary" to create one.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
