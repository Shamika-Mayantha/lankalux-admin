'use client'

import { useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const INACTIVITY_TIMEOUT = 30 * 60 * 1000 // 30 minutes in milliseconds

export function useInactivityLogout() {
  const router = useRouter()
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  const isAuthenticatedRef = useRef<boolean>(false)

  const checkAuth = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      return !!session
    } catch {
      return false
    }
  }, [])

  const logout = useCallback(async () => {
    try {
      // Check if still authenticated before logging out
      const isAuth = await checkAuth()
      if (!isAuth) return

      await supabase.auth.signOut()
      router.push('/login')
    } catch (error) {
      console.error('Error during auto-logout:', error)
      // Force redirect even if signOut fails
      router.push('/login')
    }
  }, [router, checkAuth])

  const resetTimer = useCallback(async () => {
    // Clear existing timer
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }

    // Check if user is authenticated
    const isAuth = await checkAuth()
    isAuthenticatedRef.current = isAuth

    // Only set timer if authenticated
    if (isAuth) {
      timeoutRef.current = setTimeout(() => {
        logout()
      }, INACTIVITY_TIMEOUT)
    }
  }, [checkAuth, logout])

  useEffect(() => {
    // Only run in browser environment
    if (typeof window === 'undefined') return

    // Initialize authentication check
    checkAuth().then((isAuth) => {
      isAuthenticatedRef.current = isAuth
      if (isAuth) {
        resetTimer()
      }
    })

    // List of events that indicate user activity
    const events = [
      'mousedown',
      'mousemove',
      'keypress',
      'scroll',
      'touchstart',
      'click',
      'keydown',
    ]

    // Add event listeners
    const handleActivity = () => {
      if (isAuthenticatedRef.current) {
        resetTimer()
      }
    }

    events.forEach((event) => {
      window.addEventListener(event, handleActivity, { passive: true })
    })

    // Also listen for visibility change (tab focus)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isAuthenticatedRef.current) {
        resetTimer()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    // Cleanup
    return () => {
      events.forEach((event) => {
        window.removeEventListener(event, handleActivity)
      })
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [resetTimer, checkAuth])

  // Periodically check authentication status (every 5 minutes)
  useEffect(() => {
    // Only run in browser environment
    if (typeof window === 'undefined') return

    const authCheckInterval = setInterval(async () => {
      const isAuth = await checkAuth()
      isAuthenticatedRef.current = isAuth
      
      if (!isAuth && timeoutRef.current) {
        // User is no longer authenticated, clear timer
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      } else if (isAuth && !timeoutRef.current) {
        // User became authenticated, start timer
        resetTimer()
      }
    }, 5 * 60 * 1000) // Check every 5 minutes

    return () => {
      clearInterval(authCheckInterval)
    }
  }, [checkAuth, resetTimer])
}
