'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { ThemeToggle } from '@/components/ThemeToggle'

interface Request {
  id: string
  client_name: string | null
  start_date: string | null
  end_date: string | null
  status: string | null
  cancellation_reason?: string | null
  created_at: string
}

export default function DashboardPage() {
  const [user, setUser] = useState<{ email?: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [requests, setRequests] = useState<Request[]>([])
  const [requestsLoading, setRequestsLoading] = useState(true)
  const [unreadChats, setUnreadChats] = useState(0)
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

  const fetchUnreadChats = useCallback(async () => {
    if (loading) return
    try {
      const { count, error } = await supabase
        .from('website_chat_sessions')
        .select('*', { count: 'exact', head: true })
        .eq('is_read', false)
      if (error) {
        console.error('Error fetching unread chats count:', error)
        return
      }
      setUnreadChats(count || 0)
    } catch (err) {
      console.error('Unexpected error fetching unread chats count:', err)
    }
  }, [loading])

  useEffect(() => {
    fetchRequests()
  }, [fetchRequests])

  useEffect(() => {
    fetchUnreadChats()
  }, [fetchUnreadChats])

  // Refresh requests when page becomes visible (user navigates back)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && !loading) {
        fetchRequests()
        fetchUnreadChats()
      }
    }

    const handleFocus = () => {
      if (!loading) {
        fetchRequests()
        fetchUnreadChats()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', handleFocus)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleFocus)
    }
  }, [loading, fetchRequests, fetchUnreadChats])

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
      <div className="min-h-screen bg-page flex items-center justify-center">
        <div className="text-center text-primary">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-2 border-[var(--border-color)] border-t-[var(--accent-gold)] mb-4" />
          <p className="text-secondary">Loading...</p>
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
    if (!status) return 'text-secondary'
    const statusLower = status.toLowerCase()
    if (statusLower === 'new') return 'text-blue-300'
    if (statusLower === 'follow_up') return 'text-amber-300'
    if (statusLower === 'deposit') return 'text-cyan-300'
    if (statusLower === 'sold') return 'text-emerald-300'
    if (statusLower === 'after_sales') return 'text-violet-300'
    if (statusLower === 'cancelled') return 'text-rose-300'
    return 'text-secondary'
  }

  const getStatusBgColor = (status: string | null) => {
    if (!status) return 'bg-[var(--bg-btn-secondary)]'
    const statusLower = status.toLowerCase()
    if (statusLower === 'new') return 'bg-blue-950/50'
    if (statusLower === 'follow_up') return 'bg-amber-950/40'
    if (statusLower === 'deposit') return 'bg-cyan-950/40'
    if (statusLower === 'sold') return 'bg-emerald-950/40'
    if (statusLower === 'after_sales') return 'bg-violet-950/40'
    if (statusLower === 'cancelled') return 'bg-rose-950/45'
    return 'bg-[var(--bg-btn-secondary)]'
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
    <div className="min-h-screen bg-page text-primary transition-colors duration-300">
      <div className="w-full mx-auto px-6 sm:px-10 lg:px-14 xl:px-20 py-10">
        {/* Header */}
        <div className="flex flex-wrap justify-between items-center gap-6 mb-12 bg-card border border-theme rounded-2xl px-8 py-6 shadow-card transition-colors duration-300">
          <div className="flex items-center gap-5">
            <img 
              src="/favicon.png" 
              alt="LankaLux Logo" 
              className="h-14 w-14 object-cover rounded-xl"
            />
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-primary tracking-tight">
                LankaLux Admin
              </h1>
              {user?.email && (
                <p className="text-secondary text-sm mt-0.5">
                  {user.email}
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <ThemeToggle />
            <button
              onClick={fetchRequests}
              disabled={requestsLoading}
              className="px-4 py-2.5 bg-[var(--bg-btn-secondary)] hover:bg-[var(--bg-btn-secondary-hover)] border border-theme text-primary font-medium rounded-xl transition-all text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              title="Refresh requests"
            >
              <svg
                className={`w-4 h-4 shrink-0 ${requestsLoading ? 'animate-spin' : ''} text-[var(--accent-gold)]`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span className="hidden sm:inline">Refresh</span>
            </button>
            <button
              onClick={() => window.open('/dashboard/vehicle-reservations', '_blank')}
              className="px-4 py-2.5 bg-[var(--bg-btn-secondary)] hover:bg-[var(--bg-btn-secondary-hover)] border border-theme text-primary font-medium rounded-xl transition-all text-sm flex items-center gap-2"
              title="View and manage vehicle availability"
            >
              <svg className="w-4 h-4 shrink-0 text-[var(--accent-gold)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="hidden sm:inline">Vehicle Availability</span>
            </button>
            <button
              onClick={() => router.push('/dashboard/chats')}
              className="relative px-4 py-2.5 bg-[var(--bg-btn-secondary)] hover:bg-[var(--bg-btn-secondary-hover)] border border-theme text-primary font-medium rounded-xl transition-all text-sm flex items-center gap-2"
              title="View website chat sessions"
            >
              <svg className="w-4 h-4 shrink-0 text-[var(--accent-gold)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h8m-8 4h5m-7 7l-4 2 1-4a9 9 0 119 2H7z" />
              </svg>
              <span className="hidden sm:inline">Chats</span>
              {unreadChats > 0 && (
                <span className="absolute -top-2 -right-2 min-w-5 h-5 px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold leading-5 text-center">
                  {unreadChats > 99 ? '99+' : unreadChats}
                </span>
              )}
            </button>
            <button
              onClick={() => router.push('/requests/new')}
              className="px-5 py-2.5 bg-[var(--accent-gold)] hover:bg-[var(--accent-gold-hover)] border border-[var(--accent-gold)] text-black font-semibold rounded-xl transition-all text-sm shadow-sm"
            >
              New Request
            </button>
            <span className="hidden sm:block w-px h-8 bg-[var(--border-color)] mx-1" aria-hidden />
            <button
              onClick={handleLogout}
              className="px-4 py-2.5 bg-[var(--bg-btn-secondary)] hover:bg-[var(--bg-btn-secondary-hover)] border border-theme text-primary font-medium rounded-xl transition-all text-sm"
            >
              Logout
            </button>
          </div>
        </div>

        {/* Active Requests Section */}
        <section className="mb-12 animate-slide-in">
          <h2 className="text-xl font-semibold text-primary mb-6 flex items-center gap-3">
            <span className="w-1 h-6 bg-amber-500 rounded-full" />
            Active Requests
            <span className="text-sm text-secondary font-normal">({activeRequests.length})</span>
          </h2>
          
          {requestsLoading ? (
            <div className="bg-card border border-theme rounded-2xl py-16 px-8 shadow-card transition-colors duration-300">
              <div className="text-center">
                <div className="inline-block animate-spin rounded-full h-10 w-10 border-2 border-[var(--border-color)] border-t-[var(--accent-gold)] mb-5" />
                <p className="text-secondary">Loading requests...</p>
              </div>
            </div>
          ) : activeRequests.length === 0 ? (
            <div className="bg-card border border-theme rounded-2xl py-16 px-8 shadow-card transition-colors duration-300">
              <p className="text-secondary text-center">No active requests</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {activeRequests.map((request, index) => (
                <div
                  key={request.id}
                  onClick={() => router.push(`/requests/${request.id}`)}
                  className="bg-card border border-theme rounded-2xl p-6 hover:border-amber-400 hover:shadow-card transition-all duration-300 cursor-pointer animate-fade-in"
                  style={{ animationDelay: `${index * 0.05}s` }}
                >
                  <div className="mb-4">
                    <h3 className="text-lg font-semibold text-primary mb-1.5 truncate">
                      {request.client_name || 'Unnamed Client'}
                    </h3>
                    <p className="text-sm text-secondary">
                      {formatDate(request.created_at)}
                    </p>
                  </div>
                  
                  <div className="space-y-3">
                    {(request.start_date || request.end_date) && (
                      <div>
                        <p className="text-xs text-secondary uppercase tracking-wide mb-1.5">
                          Travel Dates
                        </p>
                        <p className="text-primary">
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
                      <p className="text-xs text-secondary uppercase tracking-wide mb-1.5">
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
            <h2 className="text-xl font-semibold text-primary mb-6 flex items-center gap-3">
              <span className="w-1 h-6 bg-cyan-500 rounded-full" />
              Deposit Collected
              <span className="text-sm text-secondary font-normal">({depositRequests.length})</span>
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {depositRequests.map((request, index) => (
                <div
                  key={request.id}
                  onClick={() => router.push(`/requests/${request.id}`)}
                  className="bg-card border border-theme rounded-2xl p-6 hover:border-cyan-400 hover:shadow-card transition-all duration-300 cursor-pointer animate-fade-in"
                  style={{ animationDelay: `${index * 0.05}s` }}
                >
                  <div className="mb-4">
                    <h3 className="text-lg font-semibold text-primary mb-1.5 truncate">
                      {request.client_name || 'Unnamed Client'}
                    </h3>
                    <p className="text-sm text-secondary">
                      {formatDate(request.created_at)}
                    </p>
                  </div>
                  
                  <div className="space-y-3">
                    {(request.start_date || request.end_date) && (
                      <div>
                        <p className="text-xs text-secondary uppercase tracking-wide mb-1.5">
                          Travel Dates
                        </p>
                        <p className="text-primary">
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
                      <p className="text-xs text-secondary uppercase tracking-wide mb-1.5">
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
            <h2 className="text-xl font-semibold text-primary mb-6 flex items-center gap-3">
              <span className="w-1 h-6 bg-emerald-500 rounded-full" />
              Sold
              <span className="text-sm text-secondary font-normal">({soldRequests.length})</span>
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {soldRequests.map((request, index) => (
                <div
                  key={request.id}
                  onClick={() => router.push(`/requests/${request.id}`)}
                  className="bg-card border border-theme rounded-2xl p-6 hover:border-emerald-400 hover:shadow-card transition-all duration-300 cursor-pointer animate-fade-in"
                  style={{ animationDelay: `${index * 0.05}s` }}
                >
                  <div className="mb-4">
                    <h3 className="text-lg font-semibold text-primary mb-1.5 truncate">
                      {request.client_name || 'Unnamed Client'}
                    </h3>
                    <p className="text-sm text-secondary">
                      {formatDate(request.created_at)}
                    </p>
                  </div>
                  
                  <div className="space-y-3">
                    {(request.start_date || request.end_date) && (
                      <div>
                        <p className="text-xs text-secondary uppercase tracking-wide mb-1.5">
                          Travel Dates
                        </p>
                        <p className="text-primary">
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
                      <p className="text-xs text-secondary uppercase tracking-wide mb-1.5">
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
              className="flex items-center justify-between w-full mb-6 px-6 py-4 bg-card border border-theme rounded-2xl hover:border-rose-300 transition-all shadow-card"
            >
              <h2 className="text-xl font-semibold text-primary flex items-center gap-3">
                <span className="w-1 h-6 bg-rose-500 rounded-full" />
                Cancelled Trips ({cancelledRequests.length})
              </h2>
              <svg
                className={`w-5 h-5 text-secondary transition-transform duration-200 ${cancelledExpanded ? 'rotate-180' : ''}`}
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
                    className="bg-card border border-theme rounded-2xl p-6 hover:border-rose-300 hover:shadow-card transition-all duration-300 cursor-pointer animate-fade-in"
                    style={{ animationDelay: `${index * 0.05}s` }}
                  >
                    <div className="mb-4">
                      <h3 className="text-lg font-semibold text-primary mb-1.5 truncate">
                        {request.client_name || 'Unnamed Client'}
                      </h3>
                      <p className="text-sm text-secondary">
                        {formatDate(request.created_at)}
                      </p>
                    </div>
                    
                    <div className="space-y-3">
                      {(request.start_date || request.end_date) && (
                        <div>
                          <p className="text-xs text-secondary uppercase tracking-wide mb-1.5">
                            Travel Dates
                          </p>
                          <p className="text-primary">
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
                        <p className="text-xs text-secondary uppercase tracking-wide mb-1.5">
                          Status
                        </p>
                        <span
                          className={`inline-block px-3 py-1.5 rounded-lg text-xs font-medium ${getStatusColor(request.status)} ${getStatusBgColor(request.status)}`}
                        >
                          {(request.status || 'cancelled').toUpperCase()}
                        </span>
                        {request.cancellation_reason && (
                          <p className="text-sm text-secondary mt-2 line-clamp-2" title={request.cancellation_reason}>
                            <span className="text-secondary">Reason: </span>
                            {request.cancellation_reason}
                          </p>
                        )}
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
