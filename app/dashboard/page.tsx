'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function DashboardPage() {
  const [user, setUser] = useState<{ email?: string } | null>(null)
  const [loading, setLoading] = useState(true)
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
          <button
            onClick={handleLogout}
            className="px-6 py-2 bg-[#d4af37] hover:bg-[#b8941f] text-black font-semibold rounded-md transition-colors duration-200"
          >
            Logout
          </button>
        </div>

        {/* Dashboard Content */}
        <div className="bg-[#1a1a1a] border border-[#333] rounded-lg p-8">
          <div className="text-center py-12">
            <p className="text-gray-400 text-lg">
              Welcome to your admin dashboard. Content will be displayed here.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
