'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

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
  email: string | null
  whatsapp: string | null
  start_date: string | null
  end_date: string | null
  duration: number | null
  origin_country: string | null
  additional_preferences: string | null
  itineraryoptions: string | null
  itinerary_options?: ItineraryOptions | null
  selected_option: number | null
  public_token: string | null
  status: string | null
  notes: string | null
  created_at: string
  updated_at: string | null
}

export default function RequestDetailsPage() {
  const params = useParams()
  const router = useRouter()
  const [request, setRequest] = useState<Request | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [generatingItinerary, setGeneratingItinerary] = useState(false)
  const [selectingOption, setSelectingOption] = useState<number | null>(null)
  const [editingStatus, setEditingStatus] = useState(false)
  const [editingNotes, setEditingNotes] = useState(false)
  const [statusValue, setStatusValue] = useState('')
  const [notesValue, setNotesValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [reopening, setReopening] = useState(false)

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
        
        setRequest(requestData)
        setStatusValue(requestData.status || '')
        setNotesValue(requestData.notes || '')
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
      })
    } catch {
      return dateString
    }
  }

  const getStatusColor = (status: string | null) => {
    if (!status) return 'text-gray-400'
    const statusLower = status.toLowerCase()
    if (statusLower === 'new') return 'text-blue-400'
    if (statusLower === 'follow_up') return 'text-orange-400'
    if (statusLower === 'sold') return 'text-green-400'
    if (statusLower === 'after_sales') return 'text-purple-400'
    if (statusLower === 'cancelled') return 'text-red-400'
    return 'text-gray-400'
  }

  const getStatusBgColor = (status: string | null) => {
    if (!status) return 'bg-gray-800'
    const statusLower = status.toLowerCase()
    if (statusLower === 'new') return 'bg-blue-900/30'
    if (statusLower === 'follow_up') return 'bg-orange-900/30'
    if (statusLower === 'sold') return 'bg-green-900/30'
    if (statusLower === 'after_sales') return 'bg-purple-900/30'
    if (statusLower === 'cancelled') return 'bg-red-900/30'
    return 'bg-gray-800'
  }

  const fetchRequestData = async (id: string) => {
    const { data, error } = await supabase
      .from('requests')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      console.error('Error fetching request:', error)
      return null
    }

    const requestData = data as any
    
    // Parse itineraryoptions string to object if it exists
    if (requestData?.itineraryoptions && typeof requestData.itineraryoptions === 'string') {
      try {
        requestData.itinerary_options = JSON.parse(requestData.itineraryoptions)
      } catch (parseError) {
        console.error('Error parsing itineraryoptions:', parseError)
        requestData.itinerary_options = null
      }
    } else {
      requestData.itinerary_options = null
    }

    return requestData
  }

  const handleGenerateItinerary = async () => {
    if (!request) return

    try {
      setGeneratingItinerary(true)

      const response = await fetch('/api/generate-itinerary', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id: request.id }),
      })

      const result = await response.json()

      if (!response.ok || !result.success) {
        const errorMessage = result.error || 'Failed to generate itinerary'
        console.error('Error generating itinerary:', errorMessage)
        alert(`Failed to generate itinerary: ${errorMessage}`)
        setGeneratingItinerary(false)
        return
      }

      const updatedRequest = await fetchRequestData(request.id)

      if (!updatedRequest) {
        alert('Itinerary generated but failed to fetch updated data. Please refresh the page.')
        setGeneratingItinerary(false)
        return
      }

      setRequest(updatedRequest)
      setGeneratingItinerary(false)
    } catch (err) {
      console.error('Unexpected error generating itinerary:', err)
      alert('An unexpected error occurred. Please try again.')
      setGeneratingItinerary(false)
    }
  }

  const handleSelectOption = async (optionIndex: number) => {
    if (!request) return

    try {
      setSelectingOption(optionIndex)

      // Generate public token if it doesn't exist
      let publicToken = request.public_token
      if (!publicToken) {
        publicToken = crypto.randomUUID()
      }

      const { error } = await (supabase.from('requests') as any)
        .update({
          selected_option: optionIndex,
          public_token: publicToken,
          updated_at: new Date().toISOString(),
        })
        .eq('id', request.id)

      if (error) {
        console.error('Error selecting option:', error)
        alert('Failed to select option. Please try again.')
        setSelectingOption(null)
        return
      }

      const updatedRequest = await fetchRequestData(request.id)
      if (updatedRequest) {
        setRequest(updatedRequest)
      }
      setSelectingOption(null)
    } catch (err) {
      console.error('Unexpected error selecting option:', err)
      alert('An unexpected error occurred. Please try again.')
      setSelectingOption(null)
    }
  }

  const handleSaveStatus = async () => {
    if (!request) return

    try {
      setSaving(true)
      const { error } = await (supabase.from('requests') as any)
        .update({
          status: statusValue || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', request.id)

      if (error) {
        console.error('Error updating status:', error)
        alert('Failed to save status. Please try again.')
        setSaving(false)
        return
      }

      const updatedRequest = await fetchRequestData(request.id)
      if (updatedRequest) {
        setRequest(updatedRequest)
      }
      setEditingStatus(false)
      setSaving(false)
    } catch (err) {
      console.error('Unexpected error saving status:', err)
      alert('An unexpected error occurred. Please try again.')
      setSaving(false)
    }
  }

  const handleSaveNotes = async () => {
    if (!request) return

    try {
      setSaving(true)
      const { error } = await (supabase.from('requests') as any)
        .update({
          notes: notesValue || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', request.id)

      if (error) {
        console.error('Error updating notes:', error)
        alert('Failed to save notes. Please try again.')
        setSaving(false)
        return
      }

      const updatedRequest = await fetchRequestData(request.id)
      if (updatedRequest) {
        setRequest(updatedRequest)
      }
      setEditingNotes(false)
      setSaving(false)
    } catch (err) {
      console.error('Unexpected error saving notes:', err)
      alert('An unexpected error occurred. Please try again.')
      setSaving(false)
    }
  }

  const handleSendLink = () => {
    if (!request || !request.public_token) {
      alert('Please select an itinerary option first to generate a shareable link.')
      return
    }

    const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
    const itineraryUrl = `${baseUrl}/itinerary/${request.public_token}`

    const subject = encodeURIComponent('Your LankaLux Sri Lanka Itinerary')
    const body = encodeURIComponent(
      `Dear ${request.client_name || 'Valued Client'},

We are delighted to share your personalized Sri Lanka itinerary with you.

View your itinerary here: ${itineraryUrl}

This link provides access to your selected itinerary option. If you have any questions or would like to discuss modifications, please don't hesitate to reach out.

We look forward to creating an unforgettable experience for you in Sri Lanka.

Best regards,
LankaLux Team`
    )

    window.location.href = `mailto:${request.email || ''}?subject=${subject}&body=${body}`
  }

  const handleWhatsAppShare = () => {
    if (!request || !request.public_token) {
      alert('Please select an itinerary option first to generate a shareable link.')
      return
    }

    const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
    const itineraryUrl = `${baseUrl}/itinerary/${request.public_token}`

    const message = encodeURIComponent(
      `Your personalized LankaLux Sri Lanka itinerary is ready! View it here: ${itineraryUrl}`
    )

    const whatsappNumber = request.whatsapp?.replace(/[^0-9]/g, '') || ''
    if (whatsappNumber) {
      window.open(`https://wa.me/${whatsappNumber}?text=${message}`, '_blank')
    } else {
      alert('WhatsApp number not available for this client.')
    }
  }

  const handleCancelTrip = async () => {
    if (!request) return

    if (!confirm('Are you sure you want to cancel this trip? This will update the status to "cancelled".')) {
      return
    }

    try {
      setCancelling(true)
      const { error } = await (supabase.from('requests') as any)
        .update({
          status: 'cancelled',
          updated_at: new Date().toISOString(),
        })
        .eq('id', request.id)

      if (error) {
        console.error('Error cancelling trip:', error)
        alert('Failed to cancel trip. Please try again.')
        setCancelling(false)
        return
      }

      const updatedRequest = await fetchRequestData(request.id)
      if (updatedRequest) {
        setRequest(updatedRequest)
        setStatusValue('cancelled')
      }
      setCancelling(false)
    } catch (err) {
      console.error('Unexpected error cancelling trip:', err)
      alert('An unexpected error occurred. Please try again.')
      setCancelling(false)
    }
  }

  const handleReopenTrip = async () => {
    if (!request) return

    try {
      setReopening(true)
      const { error } = await (supabase.from('requests') as any)
        .update({
          status: 'follow_up',
          updated_at: new Date().toISOString(),
        })
        .eq('id', request.id)

      if (error) {
        console.error('Error reopening trip:', error)
        alert('Failed to reopen trip. Please try again.')
        setReopening(false)
        return
      }

      const updatedRequest = await fetchRequestData(request.id)
      if (updatedRequest) {
        setRequest(updatedRequest)
        setStatusValue('follow_up')
      }
      setReopening(false)
    } catch (err) {
      console.error('Unexpected error reopening trip:', err)
      alert('An unexpected error occurred. Please try again.')
      setReopening(false)
    }
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

  const itineraryOptions = request.itinerary_options?.options || []
  const isCancelled = request.status?.toLowerCase() === 'cancelled'
  
  // Helper function to parse itineraryoptions safely
  const parseItineraryOptions = (itineraryoptions: string | null): ItineraryOptions | null => {
    if (!itineraryoptions || typeof itineraryoptions !== 'string') {
      return null
    }
    try {
      return JSON.parse(itineraryoptions)
    } catch (error) {
      console.error('Error parsing itineraryoptions:', error)
      return null
    }
  }

  return (
    <div className="min-h-screen bg-black">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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

        {/* Cancelled Warning Banner */}
        {isCancelled && (
          <div className="mb-6 bg-red-900/20 border-2 border-red-500 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <svg
                  className="w-6 h-6 text-red-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
                <div>
                  <h3 className="text-lg font-semibold text-red-400">Trip Cancelled</h3>
                  <p className="text-sm text-red-300">This trip has been cancelled. Itinerary generation is disabled.</p>
                </div>
              </div>
              <button
                onClick={handleReopenTrip}
                disabled={reopening}
                className="px-4 py-2 bg-[#d4af37] hover:bg-[#b8941f] text-black font-semibold rounded-md transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {reopening ? (
                  <>
                    <div className="inline-block animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-black"></div>
                    Reopening...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Reopen Trip
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Request Details Card */}
        <div className="bg-[#1a1a1a] border border-[#333] rounded-lg p-6 md:p-8 mb-8">
          <div className="space-y-6">
            {/* Status Badge */}
            <div className="flex items-center justify-between pb-6 border-b border-[#333]">
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Status</p>
                {editingStatus ? (
                  <div className="flex items-center gap-2">
                    <select
                      value={statusValue}
                      onChange={(e) => setStatusValue(e.target.value)}
                      className="px-3 py-1 bg-[#0a0a0a] border border-[#333] rounded-md text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#d4af37]"
                    >
                      <option value="new">new</option>
                      <option value="follow_up">follow_up</option>
                      <option value="sold">sold</option>
                      <option value="after_sales">after_sales</option>
                      <option value="cancelled">cancelled</option>
                    </select>
                    <button
                      onClick={handleSaveStatus}
                      disabled={saving}
                      className="px-3 py-1 bg-[#d4af37] hover:bg-[#b8941f] text-black text-sm font-semibold rounded-md disabled:opacity-50"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => {
                        setStatusValue(request.status || '')
                        setEditingStatus(false)
                      }}
                      className="px-3 py-1 bg-[#333] hover:bg-[#444] text-white text-sm font-semibold rounded-md"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-block px-4 py-2 rounded-md font-semibold ${getStatusColor(request.status)} ${getStatusBgColor(request.status)} border border-current/20`}
                    >
                      {request.status || 'new'}
                    </span>
                    <button
                      onClick={() => setEditingStatus(true)}
                      className="text-gray-400 hover:text-[#d4af37] transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-4">
                {!isCancelled && (
                  <button
                    onClick={handleCancelTrip}
                    disabled={cancelling}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-md transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {cancelling ? (
                      <>
                        <div className="inline-block animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white"></div>
                        Cancelling...
                      </>
                    ) : (
                      <>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                        Cancel Trip
                      </>
                    )}
                  </button>
                )}
                <div className="text-right">
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Created At</p>
                  <p className="text-gray-300">{formatDate(request.created_at)}</p>
                </div>
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
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Start Date</p>
                  <p className="text-gray-300">{formatDate(request.start_date)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">End Date</p>
                  <p className="text-gray-300">{formatDate(request.end_date)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Duration</p>
                  <p className="text-gray-300">{request.duration ? `${request.duration} days` : 'N/A'}</p>
                </div>
              </div>
            </div>

            {/* Additional Preferences */}
            {request.additional_preferences && (
              <div className="pt-6 border-t border-[#333]">
                <h2 className="text-2xl font-semibold text-[#d4af37] mb-4">Additional Preferences</h2>
                <div className="bg-[#0a0a0a] border border-[#333] rounded-md p-4">
                  <p className="text-gray-300 whitespace-pre-wrap">{request.additional_preferences}</p>
                </div>
              </div>
            )}

            {/* Notes */}
            <div className="pt-6 border-t border-[#333]">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-semibold text-[#d4af37]">Notes</h2>
              </div>
              {editingNotes ? (
                <div className="space-y-3">
                  <textarea
                    value={notesValue}
                    onChange={(e) => setNotesValue(e.target.value)}
                    className="w-full h-32 bg-[#0a0a0a] border border-[#333] rounded-md p-4 text-gray-300 focus:outline-none focus:ring-2 focus:ring-[#d4af37] resize-y"
                    placeholder="Add internal notes..."
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleSaveNotes}
                      disabled={saving}
                      className="px-4 py-2 bg-[#d4af37] hover:bg-[#b8941f] text-black font-semibold rounded-md disabled:opacity-50"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => {
                        setNotesValue(request.notes || '')
                        setEditingNotes(false)
                      }}
                      className="px-4 py-2 bg-[#333] hover:bg-[#444] text-white font-semibold rounded-md"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="bg-[#0a0a0a] border border-[#333] rounded-md p-4">
                  {request.notes ? (
                    <p className="text-gray-300 whitespace-pre-wrap">{request.notes}</p>
                  ) : (
                    <p className="text-gray-500 italic">No notes added yet.</p>
                  )}
                  <button
                    onClick={() => setEditingNotes(true)}
                    className="mt-3 text-sm text-[#d4af37] hover:text-[#b8941f] transition-colors"
                  >
                    {request.notes ? 'Edit Notes' : 'Add Notes'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Itinerary Options Section */}
        <div className="bg-[#1a1a1a] border border-[#333] rounded-lg p-6 md:p-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-semibold text-[#d4af37]">Itinerary Options</h2>
            {itineraryOptions.length === 0 && !generatingItinerary && !isCancelled && (
              <button
                onClick={handleGenerateItinerary}
                disabled={generatingItinerary}
                className="px-4 py-2 bg-[#d4af37] hover:bg-[#b8941f] text-black font-semibold rounded-md transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
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
                    d="M12 4v16m8-8H4"
                  />
                </svg>
                Generate Itinerary Options
              </button>
            )}
            {isCancelled && itineraryOptions.length === 0 && (
              <p className="text-sm text-gray-500 italic">Itinerary generation disabled for cancelled trips</p>
            )}
            {request.public_token && request.selected_option !== null && (
              <div className="flex gap-2">
                <button
                  onClick={handleSendLink}
                  className="px-4 py-2 bg-[#d4af37] hover:bg-[#b8941f] text-black font-semibold rounded-md transition-colors duration-200 flex items-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  Send Itinerary Link
                </button>
                {request.whatsapp && (
                  <button
                    onClick={handleWhatsAppShare}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-md transition-colors duration-200 flex items-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                    </svg>
                    WhatsApp
                  </button>
                )}
              </div>
            )}
          </div>

          {generatingItinerary ? (
            <div className="bg-[#0a0a0a] border border-[#333] rounded-md p-8">
              <div className="text-center">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#d4af37] mb-4"></div>
                <p className="text-gray-400">Generating itinerary options...</p>
              </div>
            </div>
          ) : itineraryOptions.length > 0 ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {itineraryOptions.map((option, index) => {
                const isSelected = request.selected_option === index
                return (
                  <div
                    key={index}
                    className={`bg-[#0a0a0a] border rounded-lg p-6 flex flex-col ${
                      isSelected
                        ? 'border-[#d4af37] ring-2 ring-[#d4af37]'
                        : 'border-[#333]'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-4">
                      <h3 className="text-xl font-semibold text-[#d4af37] flex-1">
                        {option.title}
                      </h3>
                      {isSelected && (
                        <span className="ml-2 px-2 py-1 bg-[#d4af37] text-black text-xs font-semibold rounded">
                          SELECTED
                        </span>
                      )}
                    </div>
                    <div className="mb-4 flex-1">
                      <p className="text-sm text-gray-400 mb-3">{option.summary}</p>
                      <div className="bg-[#1a1a1a] border border-[#333] rounded-md p-4 max-h-64 overflow-y-auto">
                        <p className="text-gray-300 text-sm whitespace-pre-wrap font-mono">
                          {option.days}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleSelectOption(index)}
                      disabled={selectingOption !== null}
                      className={`w-full py-2 px-4 rounded-md font-semibold transition-colors duration-200 ${
                        isSelected
                          ? 'bg-[#333] text-gray-400 cursor-not-allowed'
                          : 'bg-[#d4af37] hover:bg-[#b8941f] text-black'
                      } disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2`}
                    >
                      {selectingOption === index ? (
                        <>
                          <div className="inline-block animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-current"></div>
                          Selecting...
                        </>
                      ) : isSelected ? (
                        'Selected'
                      ) : (
                        'Select This Option'
                      )}
                    </button>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="bg-[#0a0a0a] border border-[#333] rounded-md p-8">
              <p className="text-gray-400 text-center">No itinerary options generated yet. Click "Generate Itinerary Options" to create them.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
