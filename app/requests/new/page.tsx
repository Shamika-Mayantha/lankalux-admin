'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function NewRequestPage() {
  const [clientName, setClientName] = useState('')
  const [email, setEmail] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [travelDates, setTravelDates] = useState('')
  const [duration, setDuration] = useState('')
  const [originCountry, setOriginCountry] = useState('')
  const [details, setDetails] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const handleSubmit = async () => {
    // Reset error state
    setError(null)

    // Basic validation
    if (!clientName.trim()) {
      setError('Client name is required')
      return
    }

    if (!email.trim()) {
      setError('Email is required')
      return
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      setError('Please enter a valid email address')
      return
    }

    setLoading(true)

    try {
      const { data, error: insertError } = await supabase
        .from('requests')
        .insert([
          {
            client_name: clientName.trim(),
            email: email.trim(),
            whatsapp: whatsapp.trim() || null,
            travel_dates: travelDates.trim() || null,
            duration: duration.trim() || null,
            origin_country: originCountry.trim() || null,
            details: details.trim() || null,
            status: 'new',
          },
        ])
        .select()

      if (insertError) {
        setError(insertError.message || 'Failed to create request. Please try again.')
        setLoading(false)
        return
      }

      if (data && data.length > 0) {
        // Success - redirect to dashboard
        router.push('/dashboard')
      } else {
        setError('Request created but no data returned. Please check your dashboard.')
        setLoading(false)
      }
    } catch (err) {
      console.error('Unexpected error:', err)
      setError('An unexpected error occurred. Please try again.')
      setLoading(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && e.ctrlKey && !loading) {
      handleSubmit()
    }
  }

  return (
    <div className="min-h-screen bg-black">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => router.push('/dashboard')}
            className="text-gray-400 hover:text-[#d4af37] mb-4 transition-colors duration-200 flex items-center gap-2"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
            Back to Dashboard
          </button>
          <h1 className="text-4xl font-bold text-[#d4af37] mb-2">New Request</h1>
          <p className="text-gray-400">Create a new travel request</p>
        </div>

        {/* Form Content */}
        <div className="bg-[#1a1a1a] border border-[#333] rounded-lg p-8">
          <div className="space-y-6">
            {/* Client Name */}
            <div>
              <label htmlFor="client_name" className="block text-sm font-medium text-gray-300 mb-2">
                Client Name <span className="text-red-400">*</span>
              </label>
              <input
                id="client_name"
                type="text"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="Enter client name"
                className="w-full px-4 py-3 bg-[#0a0a0a] border border-[#333] rounded-md text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#d4af37] focus:border-transparent transition-all"
                disabled={loading}
              />
            </div>

            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-2">
                Email <span className="text-red-400">*</span>
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter email address"
                className="w-full px-4 py-3 bg-[#0a0a0a] border border-[#333] rounded-md text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#d4af37] focus:border-transparent transition-all"
                disabled={loading}
              />
            </div>

            {/* WhatsApp */}
            <div>
              <label htmlFor="whatsapp" className="block text-sm font-medium text-gray-300 mb-2">
                WhatsApp
              </label>
              <input
                id="whatsapp"
                type="text"
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                placeholder="Enter WhatsApp number"
                className="w-full px-4 py-3 bg-[#0a0a0a] border border-[#333] rounded-md text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#d4af37] focus:border-transparent transition-all"
                disabled={loading}
              />
            </div>

            {/* Travel Dates */}
            <div>
              <label htmlFor="travel_dates" className="block text-sm font-medium text-gray-300 mb-2">
                Travel Dates
              </label>
              <input
                id="travel_dates"
                type="text"
                value={travelDates}
                onChange={(e) => setTravelDates(e.target.value)}
                placeholder="e.g., March 15-25, 2024"
                className="w-full px-4 py-3 bg-[#0a0a0a] border border-[#333] rounded-md text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#d4af37] focus:border-transparent transition-all"
                disabled={loading}
              />
            </div>

            {/* Duration */}
            <div>
              <label htmlFor="duration" className="block text-sm font-medium text-gray-300 mb-2">
                Duration
              </label>
              <input
                id="duration"
                type="text"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                placeholder="e.g., 10 days"
                className="w-full px-4 py-3 bg-[#0a0a0a] border border-[#333] rounded-md text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#d4af37] focus:border-transparent transition-all"
                disabled={loading}
              />
            </div>

            {/* Origin Country */}
            <div>
              <label htmlFor="origin_country" className="block text-sm font-medium text-gray-300 mb-2">
                Origin Country
              </label>
              <input
                id="origin_country"
                type="text"
                value={originCountry}
                onChange={(e) => setOriginCountry(e.target.value)}
                placeholder="Enter origin country"
                className="w-full px-4 py-3 bg-[#0a0a0a] border border-[#333] rounded-md text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#d4af37] focus:border-transparent transition-all"
                disabled={loading}
              />
            </div>

            {/* Details */}
            <div>
              <label htmlFor="details" className="block text-sm font-medium text-gray-300 mb-2">
                Details
              </label>
              <textarea
                id="details"
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Enter additional details about the request..."
                rows={6}
                className="w-full px-4 py-3 bg-[#0a0a0a] border border-[#333] rounded-md text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#d4af37] focus:border-transparent transition-all resize-y"
                disabled={loading}
              />
              <p className="mt-2 text-xs text-gray-500">
                Press Ctrl+Enter to submit
              </p>
            </div>

            {/* Error Message */}
            {error && (
              <div className="bg-red-900/20 border border-red-700 rounded-md p-3">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}

            {/* Submit Button */}
            <div className="flex gap-4 pt-4">
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="flex-1 bg-[#d4af37] hover:bg-[#b8941f] text-black font-semibold py-3 px-6 rounded-md transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
              >
                {loading ? (
                  <>
                    <svg
                      className="animate-spin -ml-1 mr-3 h-5 w-5 text-black"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    Creating Request...
                  </>
                ) : (
                  'Create Request'
                )}
              </button>
              <button
                onClick={() => router.push('/dashboard')}
                disabled={loading}
                className="px-6 py-3 bg-[#333] hover:bg-[#444] text-white font-semibold rounded-md transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
