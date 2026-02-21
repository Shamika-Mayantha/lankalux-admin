'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface Request {
  id: string
  client_name: string | null
  travel_dates: string | null
  status: string | null
  created_at: string
}

export default function DashboardPage() {
  const [user, setUser] = useState<{ email?: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [requests, setRequests] = useState<Request[]>([])
  const [requestsLoading, setRequestsLoading] = useState(true)
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
    if (statusLower === 'pending') return 'text-yellow-400'
    if (statusLower === 'approved' || statusLower === 'confirmed') return 'text-green-400'
    if (statusLower === 'rejected' || statusLower === 'cancelled') return 'text-red-400'
    return 'text-gray-400'
  }

  return (
    <div className="min-h-screen bg-black">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold text-[#d4af37] mb-2">
              LankaLux Admin Dashboard
            </h1>
            {user?.email && (
              <p className="text-gray-400">
                Logged in as: <span className="text-gray-300 font-medium">{user.email}</span>
              </p>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => router.push('/requests/new')}
              className="px-6 py-2 bg-[#d4af37] hover:bg-[#b8941f] text-black font-semibold rounded-md transition-colors duration-200"
            >
              New Request
            </button>
            <button
              onClick={handleLogout}
              className="px-6 py-2 bg-[#333] hover:bg-[#444] text-white font-semibold rounded-md transition-colors duration-200"
            >
              Logout
            </button>
          </div>
        </div>

        {/* Requests Section */}
        <div className="mb-8">
          <h2 className="text-2xl font-semibold text-white mb-4">Requests</h2>
          
          {requestsLoading ? (
            <div className="bg-[#1a1a1a] border border-[#333] rounded-lg p-12">
              <div className="text-center">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#d4af37] mb-4"></div>
                <p className="text-gray-400">Loading requests...</p>
              </div>
            </div>
          ) : requests.length === 0 ? (
            <div className="bg-[#1a1a1a] border border-[#333] rounded-lg p-12">
              <p className="text-gray-400 text-center text-lg">No requests yet</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {requests.map((request) => (
                <div
                  key={request.id}
                  onClick={() => router.push(`/requests/${request.id}`)}
                  className="bg-[#1a1a1a] border border-[#333] rounded-lg p-6 hover:border-[#d4af37] hover:shadow-lg hover:shadow-[#d4af37]/20 transition-all duration-200 cursor-pointer"
                >
                  <div className="mb-4">
                    <h3 className="text-xl font-semibold text-white mb-1">
                      {request.client_name || 'Unnamed Client'}
                    </h3>
                    <p className="text-sm text-gray-500">
                      {formatDate(request.created_at)}
                    </p>
                  </div>
                  
                  <div className="space-y-2">
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">
                        Travel Dates
                      </p>
                      <p className="text-gray-300">
                        {request.travel_dates || 'Not specified'}
                      </p>
                    </div>
                    
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">
                        Status
                      </p>
                      <p className={`font-medium ${getStatusColor(request.status)}`}>
                        {request.status || 'Pending'}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
