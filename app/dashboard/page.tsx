'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface Request {
  id: string
  client_name: string | null
  start_date: string | null
  end_date: string | null
  status: string | null
  created_at: string
}

export default function DashboardPage() {
  const [user, setUser] = useState<{ email?: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [requests, setRequests] = useState<Request[]>([])
  const [requestsLoading, setRequestsLoading] = useState(true)
  const [cancelledExpanded, setCancelledExpanded] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const checkSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession()

        if (error) {
          console.error('Error checking session:', error)
          router.push('/login')
          return
        }

        if (!session || !session.user) {
          router.push('/login')
          return
        }

        setUser(session.user)
        setLoading(false)
      } catch (err) {
        console.error('Unexpected error:', err)
        router.push('/login')
      }
    }

    checkSession()
  }, [router])

  useEffect(() => {
    const fetchRequests = async () => {
      if (loading) return // Wait for session check

      try {
        setRequestsLoading(true)
        const { data, error } = await supabase
          .from('requests')
          .select('*')
          .order('created_at', { ascending: false })

        if (error) {
          console.error('Error fetching requests:', error)
          setRequestsLoading(false)
          return
        }

        setRequests(data || [])
        setRequestsLoading(false)
      } catch (err) {
        console.error('Unexpected error fetching requests:', err)
        setRequestsLoading(false)
      }
    }

    fetchRequests()
  }, [loading])

  const handleLogout = async () => {
    try {
      const { error } = await supabase.auth.signOut()

      if (error) {
        console.error('Error signing out:', error)
        return
      }

      router.push('/login')
    } catch (err) {
      console.error('Unexpected error during logout:', err)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#d4af37] mb-4"></div>
          <p className="text-gray-400">Loading...</p>
        </div>
      </div>
    )
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A'
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
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

  const activeRequests = requests.filter((r) => r.status?.toLowerCase() !== 'cancelled')
  const cancelledRequests = requests.filter((r) => r.status?.toLowerCase() === 'cancelled')

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-[#0a0a0a] to-black">
      <div className="max-w-[95%] mx-auto px-3 sm:px-4 lg:px-6 py-4">
        {/* Header */}
        <div className="flex justify-between items-center mb-6 bg-[#1a1a1a]/50 backdrop-blur-sm border border-[#333] rounded-xl p-4 shadow-lg animate-fade-in">
          <div className="flex items-center gap-4">
            <img 
              src="/favicon.png" 
              alt="LankaLux Logo" 
              className="h-12 w-12 object-contain"
            />
            <div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-[#d4af37] to-[#b8941f] bg-clip-text text-transparent">
                LankaLux Admin Dashboard
              </h1>
              {user?.email && (
                <p className="text-gray-400 text-sm">
                  Logged in as: <span className="text-gray-300 font-medium">{user.email}</span>
                </p>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => router.push('/requests/new')}
              className="px-4 py-2 bg-gradient-to-r from-[#d4af37] to-[#b8941f] hover:from-[#b8941f] hover:to-[#d4af37] text-black font-semibold rounded-md transition-all duration-200 shadow-lg hover:shadow-[#d4af37]/50 transform hover:scale-105 active:scale-95 text-sm"
            >
              New Request
            </button>
            <button
              onClick={handleLogout}
              className="px-4 py-2 bg-[#333] hover:bg-[#444] text-white font-semibold rounded-md transition-all duration-200 hover:shadow-lg transform hover:scale-105 active:scale-95 text-sm"
            >
              Logout
            </button>
          </div>
        </div>

        {/* Active Requests Section */}
        <div className="mb-6 animate-slide-in">
          <h2 className="text-xl font-semibold text-white mb-3 flex items-center gap-2">
            <span className="w-1 h-6 bg-gradient-to-b from-[#d4af37] to-[#b8941f] rounded-full"></span>
            Active Requests
            <span className="text-sm text-gray-500 font-normal">({activeRequests.length})</span>
          </h2>
          
          {requestsLoading ? (
            <div className="bg-[#1a1a1a]/50 backdrop-blur-sm border border-[#333] rounded-xl p-8">
              <div className="text-center">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#d4af37] mb-4"></div>
                <p className="text-gray-400">Loading requests...</p>
              </div>
            </div>
          ) : activeRequests.length === 0 ? (
            <div className="bg-[#1a1a1a]/50 backdrop-blur-sm border border-[#333] rounded-xl p-8">
              <p className="text-gray-400 text-center">No active requests</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {activeRequests.map((request, index) => (
                <div
                  key={request.id}
                  onClick={() => router.push(`/requests/${request.id}`)}
                  className="bg-[#1a1a1a]/50 backdrop-blur-sm border border-[#333] rounded-xl p-4 hover:border-[#d4af37] hover:shadow-lg hover:shadow-[#d4af37]/20 transition-all duration-200 cursor-pointer transform hover:scale-[1.02] active:scale-[0.98] animate-fade-in"
                  style={{ animationDelay: `${index * 0.05}s` }}
                >
                  <div className="mb-3">
                    <h3 className="text-lg font-semibold text-white mb-1 truncate">
                      {request.client_name || 'Unnamed Client'}
                    </h3>
                    <p className="text-xs text-gray-500">
                      {formatDate(request.created_at)}
                    </p>
                  </div>
                  
                  <div className="space-y-2">
                    {(request.start_date || request.end_date) && (
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">
                          Travel Dates
                        </p>
                        <p className="text-gray-300">
                          {request.start_date && request.end_date
                            ? `${formatDate(request.start_date)} - ${formatDate(request.end_date)}`
                            : request.start_date
                            ? `From ${formatDate(request.start_date)}`
                            : request.end_date
                            ? `Until ${formatDate(request.end_date)}`
                            : 'Not specified'}
                        </p>
                      </div>
                    )}
                    
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">
                        Status
                      </p>
                      <span
                        className={`inline-block px-2 py-1 rounded-md text-xs font-semibold ${getStatusColor(request.status)} ${getStatusBgColor(request.status)} border border-current/20`}
                      >
                        {(request.status || 'new').toUpperCase()}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Cancelled Trips Section */}
        {cancelledRequests.length > 0 && (
          <div className="mb-6 animate-slide-in">
            <button
              onClick={() => setCancelledExpanded(!cancelledExpanded)}
              className="flex items-center justify-between w-full mb-3 px-4 py-2 bg-[#1a1a1a]/50 backdrop-blur-sm border border-[#333] rounded-xl hover:border-red-500/50 transition-all duration-200 hover:shadow-lg"
            >
              <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                <span className="w-1 h-6 bg-red-500 rounded-full"></span>
                Cancelled Trips ({cancelledRequests.length})
              </h2>
              <svg
                className={`w-5 h-5 text-gray-400 transition-transform duration-200 ${cancelledExpanded ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>

            {cancelledExpanded && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {cancelledRequests.map((request, index) => (
                  <div
                    key={request.id}
                    onClick={() => router.push(`/requests/${request.id}`)}
                    className="bg-[#1a1a1a]/50 backdrop-blur-sm border border-red-500/30 rounded-xl p-4 hover:border-red-500 hover:shadow-lg hover:shadow-red-500/20 transition-all duration-200 cursor-pointer opacity-75 transform hover:scale-[1.02] active:scale-[0.98] animate-fade-in"
                    style={{ animationDelay: `${index * 0.05}s` }}
                  >
                    <div className="mb-3">
                      <h3 className="text-lg font-semibold text-white mb-1 truncate">
                        {request.client_name || 'Unnamed Client'}
                      </h3>
                      <p className="text-xs text-gray-500">
                        {formatDate(request.created_at)}
                      </p>
                    </div>
                    
                    <div className="space-y-2">
                      {(request.start_date || request.end_date) && (
                        <div>
                          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">
                            Travel Dates
                          </p>
                          <p className="text-gray-300">
                            {request.start_date && request.end_date
                              ? `${formatDate(request.start_date)} - ${formatDate(request.end_date)}`
                              : request.start_date
                              ? `From ${formatDate(request.start_date)}`
                              : request.end_date
                              ? `Until ${formatDate(request.end_date)}`
                              : 'Not specified'}
                          </p>
                        </div>
                      )}
                      
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">
                          Status
                        </p>
                        <span
                          className={`inline-block px-2 py-1 rounded-md text-xs font-semibold ${getStatusColor(request.status)} ${getStatusBgColor(request.status)} border border-current/20`}
                        >
                          {(request.status || 'cancelled').toUpperCase()}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
