'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function NewRequestPage() {
  const [clientName, setClientName] = useState('')
  const [email, setEmail] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [duration, setDuration] = useState<number | null>(null)
  const [originCountry, setOriginCountry] = useState('')
  const [numberOfAdults, setNumberOfAdults] = useState('')
  const [numberOfChildren, setNumberOfChildren] = useState('')
  const [childrenAges, setChildrenAges] = useState<string[]>([])
  const [additionalPreferences, setAdditionalPreferences] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    if (startDate && endDate) {
      const start = new Date(startDate)
      const end = new Date(endDate)
      if (end >= start) {
        const diffTime = Math.abs(end.getTime() - start.getTime())
        // Add 1 to make duration inclusive of both start and end dates
        // e.g., June 2-4 = 3 days (June 2, 3, 4)
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1
        setDuration(diffDays)
      } else {
        setDuration(null)
      }
    } else {
      setDuration(null)
    }
  }, [startDate, endDate])

  const generateNextRequestId = async (): Promise<string> => {
    try {
      // Fetch all existing request IDs
      const { data, error } = await supabase
        .from('requests')
        .select('id')

      if (error) {
        console.error('Error fetching existing IDs:', error)
        // Fallback to req-id-001 if there's an error
        return 'req-id-001'
      }

      // Extract numbers from IDs matching pattern "req-id-XXX"
      const idPattern = /^req-id-(\d+)$/
      const existingNumbers: number[] = []

      if (data) {
        data.forEach((row: { id: string }) => {
          const match = row.id.match(idPattern)
          if (match) {
            existingNumbers.push(parseInt(match[1], 10))
          }
        })
      }

      // Find the highest number or default to 0
      const maxNumber = existingNumbers.length > 0 ? Math.max(...existingNumbers) : 0

      // Generate next ID with zero-padding (001, 002, etc.)
      const nextNumber = maxNumber + 1
      const paddedNumber = nextNumber.toString().padStart(3, '0')

      return `req-id-${paddedNumber}`
    } catch (err) {
      console.error('Error generating request ID:', err)
      // Fallback to req-id-001 if there's an error
      return 'req-id-001'
    }
  }

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
      // Generate the next sequential request ID
      const requestId = await generateNextRequestId()

      const { data, error: insertError } = await supabase
        .from('requests')
        .insert([
          {
            id: requestId,
            client_name: clientName.trim(),
            email: email.trim(),
            whatsapp: whatsapp.trim() || null,
            start_date: startDate || null,
            end_date: endDate || null,
            duration: duration || null,
            origin_country: originCountry.trim() || null,
            number_of_adults: numberOfAdults ? parseInt(numberOfAdults) : null,
            number_of_children: numberOfChildren ? parseInt(numberOfChildren) : null,
            children_ages: childrenAges.length > 0 ? JSON.stringify(childrenAges.map(age => parseInt(age)).filter(age => !isNaN(age))) : null,
            additional_preferences: additionalPreferences.trim() || null,
            status: 'new',
          },
        ] as any)
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

  // Get today's date in YYYY-MM-DD format for min attribute
  const today = new Date().toISOString().split('T')[0]

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

            {/* Start Date */}
            <div>
              <label htmlFor="start_date" className="block text-sm font-medium text-gray-300 mb-2">
                Start Date
              </label>
              <input
                id="start_date"
                type="date"
                value={startDate}
                onChange={(e) => {
                  const selectedStartDate = e.target.value
                  // If end date is set and the new start date is after end date, clear end date
                  if (endDate && selectedStartDate) {
                    const isValidEndDate = /^\d{4}-\d{2}-\d{2}$/.test(endDate)
                    const isValidStartDate = /^\d{4}-\d{2}-\d{2}$/.test(selectedStartDate)
                    if (isValidEndDate && isValidStartDate && selectedStartDate > endDate) {
                      setEndDate('')
                    }
                  }
                  setStartDate(selectedStartDate)
                }}
                min={today}
                max="2099-12-31"
                className="w-full px-4 py-3 bg-[#0a0a0a] border border-[#333] rounded-md text-white focus:outline-none focus:ring-2 focus:ring-[#d4af37] focus:border-transparent transition-all [color-scheme:dark]"
                disabled={loading}
              />
            </div>

            {/* End Date */}
            <div>
              <label htmlFor="end_date" className="block text-sm font-medium text-gray-300 mb-2">
                End Date
              </label>
              <input
                id="end_date"
                type="date"
                value={endDate}
                onChange={(e) => {
                  const selectedEndDate = e.target.value
                  // Only validate if both dates are complete (valid date format: YYYY-MM-DD)
                  // Check if the date string matches the expected format and is complete
                  const isValidDate = /^\d{4}-\d{2}-\d{2}$/.test(selectedEndDate)
                  const isStartDateValid = startDate && /^\d{4}-\d{2}-\d{2}$/.test(startDate)
                  
                  if (isValidDate && isStartDateValid && selectedEndDate < startDate) {
                    alert('End date cannot be before start date')
                    return
                  }
                  setEndDate(selectedEndDate)
                }}
                min={startDate || today}
                max="2099-12-31"
                className="w-full px-4 py-3 bg-[#0a0a0a] border border-[#333] rounded-md text-white focus:outline-none focus:ring-2 focus:ring-[#d4af37] focus:border-transparent transition-all [color-scheme:dark]"
                disabled={loading}
              />
            </div>

            {/* Duration */}
            <div>
              <label htmlFor="duration" className="block text-sm font-medium text-gray-300 mb-2">
                Duration (days)
              </label>
              <input
                id="duration"
                type="text"
                value={duration !== null ? `${duration} days` : ''}
                readOnly
                className="w-full px-4 py-3 bg-[#0a0a0a] border border-[#333] rounded-md text-gray-400 cursor-not-allowed"
                disabled={true}
              />
            </div>

            {/* Number of Adults */}
            <div>
              <label htmlFor="number_of_adults" className="block text-sm font-medium text-gray-300 mb-2">
                Number of Adults
              </label>
              <input
                id="number_of_adults"
                type="number"
                min="1"
                value={numberOfAdults}
                onChange={(e) => setNumberOfAdults(e.target.value)}
                placeholder="Enter number of adults"
                className="w-full px-4 py-3 bg-[#0a0a0a] border border-[#333] rounded-md text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#d4af37] focus:border-transparent transition-all"
                disabled={loading}
              />
            </div>

            {/* Number of Children */}
            <div>
              <label htmlFor="number_of_children" className="block text-sm font-medium text-gray-300 mb-2">
                Number of Children
              </label>
              <input
                id="number_of_children"
                type="number"
                min="0"
                value={numberOfChildren}
                onChange={(e) => {
                  const count = parseInt(e.target.value) || 0
                  setNumberOfChildren(e.target.value)
                  // Initialize or adjust children ages array for any number of children
                  if (count >= 1) {
                    setChildrenAges(prev => {
                      const newAges = [...prev]
                      while (newAges.length < count) {
                        newAges.push('')
                      }
                      return newAges.slice(0, count)
                    })
                  } else {
                    setChildrenAges([])
                  }
                }}
                placeholder="Enter number of children"
                className="w-full px-4 py-3 bg-[#0a0a0a] border border-[#333] rounded-md text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#d4af37] focus:border-transparent transition-all"
                disabled={loading}
              />
            </div>

            {/* Children Ages (show if any children) */}
            {parseInt(numberOfChildren) > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  {parseInt(numberOfChildren) === 1 ? 'Child Age (years)' : 'Children Ages (years)'}
                </label>
                <div className={`grid gap-3 ${parseInt(numberOfChildren) <= 3 ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'}`}>
                  {childrenAges.map((age, index) => (
                    <div key={index}>
                      <label className="block text-xs text-gray-400 mb-1">
                        Child {index + 1} Age
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="17"
                        value={age}
                        onChange={(e) => {
                          const newAges = [...childrenAges]
                          newAges[index] = e.target.value
                          setChildrenAges(newAges)
                        }}
                        placeholder={`Enter age of child ${index + 1}`}
                        className="w-full px-4 py-3 bg-[#0a0a0a] border border-[#333] rounded-md text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#d4af37] focus:border-transparent transition-all"
                        disabled={loading}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

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

            {/* Additional Preferences */}
            <div>
              <label htmlFor="additional_preferences" className="block text-sm font-medium text-gray-300 mb-2">
                Additional Preferences
              </label>
              <textarea
                id="additional_preferences"
                value={additionalPreferences}
                onChange={(e) => setAdditionalPreferences(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="e.g., honeymoon, wildlife safari, luxury focus, train journeys, ayurveda retreat, family friendly, adventure"
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
