'use client'

import { useState, useEffect, useCallback } from 'react'
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

  const fetchRequests = useCallback(async () => {
    if (loading) return // Wait for session check

    try {
      setRequestsLoading(true)
      const { data, error } = await supabase
        .from('Client Requests')
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
  }, [loading])

  useEffect(() => {
    fetchRequests()
  }, [fetchRequests])

  // Refresh requests when page becomes visible (user navigates back)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && !loading) {
        fetchRequests()
      }
    }

    const handleFocus = () => {
      if (!loading) {
        fetchRequests()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', handleFocus)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleFocus)
    }
  }, [loading, fetchRequests])

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
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-2 border-amber-500/20 border-t-amber-400/70 mb-4" />
          <p className="text-gray-500">Loading...</p>
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
    if (statusLower === 'new') return 'text-blue-300'
    if (statusLower === 'follow_up') return 'text-amber-300'
    if (statusLower === 'deposit') return 'text-cyan-300'
    if (statusLower === 'sold') return 'text-emerald-300'
    if (statusLower === 'after_sales') return 'text-violet-300'
    if (statusLower === 'cancelled') return 'text-rose-400'
    return 'text-gray-400'
  }

  const getStatusBgColor = (status: string | null) => {
    if (!status) return 'bg-gray-700/20'
    const statusLower = status.toLowerCase()
    if (statusLower === 'new') return 'bg-blue-500/15'
    if (statusLower === 'follow_up') return 'bg-amber-500/15'
    if (statusLower === 'deposit') return 'bg-cyan-500/15'
    if (statusLower === 'sold') return 'bg-emerald-500/15'
    if (statusLower === 'after_sales') return 'bg-violet-500/15'
    if (statusLower === 'cancelled') return 'bg-rose-500/15'
    return 'bg-gray-700/20'
  }

  const activeRequests = requests.filter(
    (r) =>
      r.status?.toLowerCase() !== 'cancelled' &&
      r.status?.toLowerCase() !== 'deposit' &&
      r.status?.toLowerCase() !== 'sold'
  )
  const depositRequests = requests.filter((r) => r.status?.toLowerCase() === 'deposit')
  const soldRequests = requests.filter((r) => r.status?.toLowerCase() === 'sold')
  const cancelledRequests = requests.filter((r) => r.status?.toLowerCase() === 'cancelled')

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-[#0d0d0d] to-gray-950">
      <div className="max-w-7xl mx-auto px-5 sm:px-8 lg:px-10 py-10">
        {/* Header */}
        <div className="flex flex-wrap justify-between items-center gap-6 mb-12 bg-white/[0.03] backdrop-blur-sm border border-white/[0.08] rounded-2xl px-8 py-6 shadow-xl">
          <div className="flex items-center gap-5">
            <img 
              src="/favicon.png" 
              alt="LankaLux Logo" 
              className="h-14 w-14 object-cover rounded-xl"
            />
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-amber-100/90 tracking-tight">
                LankaLux Admin
              </h1>
              {user?.email && (
                <p className="text-gray-500 text-sm mt-0.5">
                  <span className="text-gray-400">{user.email}</span>
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => window.open('/dashboard/vehicle-reservations', '_blank')}
              className="px-5 py-2.5 bg-white/[0.05] hover:bg-white/[0.08] border border-white/[0.08] text-gray-300 font-medium rounded-xl transition-all text-sm flex items-center gap-2"
              title="View and manage vehicle availability"
            >
              <svg className="w-4 h-4 text-amber-400/80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Vehicle Availability
            </button>
            <button
              onClick={fetchRequests}
              disabled={requestsLoading}
              className="px-5 py-2.5 bg-white/[0.05] hover:bg-white/[0.08] border border-white/[0.08] text-gray-300 font-medium rounded-xl transition-all text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              title="Refresh requests"
            >
              <svg 
                className={`w-4 h-4 ${requestsLoading ? 'animate-spin' : ''} text-amber-400/80`}
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>
            <button
              onClick={() => router.push('/requests/new')}
              className="px-5 py-2.5 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 text-amber-100 font-semibold rounded-xl transition-all text-sm"
            >
              New Request
            </button>
            <button
              onClick={handleLogout}
              className="px-5 py-2.5 bg-white/[0.05] hover:bg-white/[0.08] border border-white/[0.08] text-gray-300 font-medium rounded-xl transition-all text-sm"
            >
              Logout
            </button>
          </div>
        </div>

        {/* Active Requests Section */}
        <section className="mb-12 animate-slide-in">
          <h2 className="text-xl font-semibold text-gray-300 mb-6 flex items-center gap-3">
            <span className="w-1 h-6 bg-amber-500/60 rounded-full" />
            Active Requests
            <span className="text-sm text-gray-500 font-normal">({activeRequests.length})</span>
          </h2>
          
          {requestsLoading ? (
            <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl py-16 px-8">
              <div className="text-center">
                <div className="inline-block animate-spin rounded-full h-10 w-10 border-2 border-amber-500/20 border-t-amber-400/60 mb-5" />
                <p className="text-gray-500">Loading requests...</p>
              </div>
            </div>
          ) : activeRequests.length === 0 ? (
            <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl py-16 px-8">
              <p className="text-gray-500 text-center">No active requests</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {activeRequests.map((request, index) => (
                <div
                  key={request.id}
                  onClick={() => router.push(`/requests/${request.id}`)}
                  className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-6 hover:border-amber-500/30 hover:bg-white/[0.05] transition-all cursor-pointer animate-fade-in"
                  style={{ animationDelay: `${index * 0.05}s` }}
                >
                  <div className="mb-4">
                    <h3 className="text-lg font-semibold text-gray-100 mb-1.5 truncate">
                      {request.client_name || 'Unnamed Client'}
                    </h3>
                    <p className="text-sm text-gray-500">
                      {formatDate(request.created_at)}
                    </p>
                  </div>
                  
                  <div className="space-y-3">
                    {(request.start_date || request.end_date) && (
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wide mb-1.5">
                          Travel Dates
                        </p>
                        <p className="text-gray-400">
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
                      <p className="text-xs text-gray-500 uppercase tracking-wide mb-1.5">
                        Status
                      </p>
                      <span
                        className={`inline-block px-3 py-1.5 rounded-lg text-xs font-medium ${getStatusColor(request.status)} ${getStatusBgColor(request.status)}`}
                      >
                        {(request.status || 'new').toUpperCase()}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Deposit Collected Section */}
        {depositRequests.length > 0 && (
          <section className="mb-12 animate-slide-in">
            <h2 className="text-xl font-semibold text-gray-300 mb-6 flex items-center gap-3">
              <span className="w-1 h-6 bg-cyan-500/60 rounded-full" />
              Deposit Collected
              <span className="text-sm text-gray-500 font-normal">({depositRequests.length})</span>
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {depositRequests.map((request, index) => (
                <div
                  key={request.id}
                  onClick={() => router.push(`/requests/${request.id}`)}
                  className="bg-white/[0.03] border border-cyan-500/15 rounded-2xl p-6 hover:border-cyan-500/30 hover:bg-white/[0.05] transition-all cursor-pointer animate-fade-in"
                  style={{ animationDelay: `${index * 0.05}s` }}
                >
                  <div className="mb-4">
                    <h3 className="text-lg font-semibold text-gray-100 mb-1.5 truncate">
                      {request.client_name || 'Unnamed Client'}
                    </h3>
                    <p className="text-sm text-gray-500">
                      {formatDate(request.created_at)}
                    </p>
                  </div>
                  
                  <div className="space-y-3">
                    {(request.start_date || request.end_date) && (
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wide mb-1.5">
                          Travel Dates
                        </p>
                        <p className="text-gray-400">
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
                      <p className="text-xs text-gray-500 uppercase tracking-wide mb-1.5">
                        Status
                      </p>
                      <span
                        className={`inline-block px-3 py-1.5 rounded-lg text-xs font-medium ${getStatusColor(request.status)} ${getStatusBgColor(request.status)}`}
                      >
                        {(request.status || 'deposit').toUpperCase()}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Sold Section */}
        {soldRequests.length > 0 && (
          <section className="mb-12 animate-slide-in">
            <h2 className="text-xl font-semibold text-gray-300 mb-6 flex items-center gap-3">
              <span className="w-1 h-6 bg-emerald-500/60 rounded-full" />
              Sold
              <span className="text-sm text-gray-500 font-normal">({soldRequests.length})</span>
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {soldRequests.map((request, index) => (
                <div
                  key={request.id}
                  onClick={() => router.push(`/requests/${request.id}`)}
                  className="bg-white/[0.03] border border-emerald-500/15 rounded-2xl p-6 hover:border-emerald-500/30 hover:bg-white/[0.05] transition-all cursor-pointer animate-fade-in"
                  style={{ animationDelay: `${index * 0.05}s` }}
                >
                  <div className="mb-4">
                    <h3 className="text-lg font-semibold text-gray-100 mb-1.5 truncate">
                      {request.client_name || 'Unnamed Client'}
                    </h3>
                    <p className="text-sm text-gray-500">
                      {formatDate(request.created_at)}
                    </p>
                  </div>
                  
                  <div className="space-y-3">
                    {(request.start_date || request.end_date) && (
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wide mb-1.5">
                          Travel Dates
                        </p>
                        <p className="text-gray-400">
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
                      <p className="text-xs text-gray-500 uppercase tracking-wide mb-1.5">
                        Status
                      </p>
                      <span
                        className={`inline-block px-3 py-1.5 rounded-lg text-xs font-medium ${getStatusColor(request.status)} ${getStatusBgColor(request.status)}`}
                      >
                        {(request.status || 'sold').toUpperCase()}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Cancelled Trips Section */}
        {cancelledRequests.length > 0 && (
          <section className="mb-12 animate-slide-in">
            <button
              onClick={() => setCancelledExpanded(!cancelledExpanded)}
              className="flex items-center justify-between w-full mb-6 px-6 py-4 bg-white/[0.03] border border-white/[0.08] rounded-2xl hover:border-rose-500/25 transition-all"
            >
              <h2 className="text-xl font-semibold text-gray-300 flex items-center gap-3">
                <span className="w-1 h-6 bg-rose-500/60 rounded-full" />
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
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {cancelledRequests.map((request, index) => (
                  <div
                    key={request.id}
                    onClick={() => router.push(`/requests/${request.id}`)}
                    className="bg-white/[0.03] border border-rose-500/15 rounded-2xl p-6 hover:border-rose-500/30 hover:bg-white/[0.05] transition-all cursor-pointer opacity-90 animate-fade-in"
                    style={{ animationDelay: `${index * 0.05}s` }}
                  >
                    <div className="mb-4">
                      <h3 className="text-lg font-semibold text-gray-100 mb-1.5 truncate">
                        {request.client_name || 'Unnamed Client'}
                      </h3>
                      <p className="text-sm text-gray-500">
                        {formatDate(request.created_at)}
                      </p>
                    </div>
                    
                    <div className="space-y-3">
                      {(request.start_date || request.end_date) && (
                        <div>
                          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1.5">
                            Travel Dates
                          </p>
                          <p className="text-gray-400">
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
                        <p className="text-xs text-gray-500 uppercase tracking-wide mb-1.5">
                          Status
                        </p>
                        <span
                          className={`inline-block px-3 py-1.5 rounded-lg text-xs font-medium ${getStatusColor(request.status)} ${getStatusBgColor(request.status)}`}
                        >
                          {(request.status || 'cancelled').toUpperCase()}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  )
}
