'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function Home() {
  const router = useRouter()

  useEffect(() => {
    const checkSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (session) {
          // User is logged in, redirect to dashboard
          router.push('/dashboard')
        } else {
          // No session, redirect to login
          router.push('/login')
        }
      } catch (err) {
        console.error('Error checking session:', err)
        router.push('/login')
      }
    }

    checkSession()
  }, [router])

  // Show loading state while checking session
  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="text-center">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-2 border-amber-200 border-t-amber-600 mb-4"></div>
        <p className="text-gray-600">Loading...</p>
      </div>
    </div>
  )
}
