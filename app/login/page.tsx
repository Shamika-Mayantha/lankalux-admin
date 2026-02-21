'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const handleLogin = async () => {
    // Reset error state
    setError(null)

    // Validate inputs
    if (!email || !password) {
      setError('Please enter both email and password')
      return
    }

    setLoading(true)

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (signInError) {
        setError(signInError.message || 'Failed to sign in. Please check your credentials.')
        setLoading(false)
        return
      }

      if (data?.user) {
        // Redirect to dashboard on success
        router.push('/dashboard')
      }
    } catch (err) {
      setError('An unexpected error occurred. Please try again.')
      setLoading(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !loading) {
      handleLogin()
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-[#0a0a0a] to-black flex items-center justify-center px-4 relative overflow-hidden">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-20 w-72 h-72 bg-[#d4af37]/5 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-20 right-20 w-96 h-96 bg-[#d4af37]/5 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
      </div>

      <div className="w-full max-w-md relative z-10 animate-fade-in">
        <div className="bg-[#1a1a1a]/95 backdrop-blur-sm border border-[#333] rounded-xl p-8 shadow-2xl hover:shadow-[#d4af37]/20 transition-all duration-300">
          {/* Logo */}
          <div className="flex justify-center mb-6">
            <div className="relative">
              <img 
                src="/favicon.png" 
                alt="LankaLux Logo" 
                className="h-20 w-20 object-contain animate-fade-in"
              />
            </div>
          </div>
          
          <h1 className="text-3xl font-bold text-[#d4af37] mb-2 text-center bg-gradient-to-r from-[#d4af37] to-[#b8941f] bg-clip-text text-transparent">
            LankaLux Admin
          </h1>
          <p className="text-gray-400 text-center mb-8">Sign in to your account</p>

          <div className="space-y-6">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-2">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Enter your email"
                className="w-full px-4 py-3 bg-[#0a0a0a] border border-[#333] rounded-md text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#d4af37] focus:border-[#d4af37] transition-all hover:border-[#444]"
                disabled={loading}
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-2">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Enter your password"
                className="w-full px-4 py-3 bg-[#0a0a0a] border border-[#333] rounded-md text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#d4af37] focus:border-[#d4af37] transition-all hover:border-[#444]"
                disabled={loading}
              />
            </div>

            {error && (
              <div className="bg-red-900/20 border border-red-700 rounded-md p-3">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}

            <button
              onClick={handleLogin}
              disabled={loading}
              className="w-full bg-gradient-to-r from-[#d4af37] to-[#b8941f] hover:from-[#b8941f] hover:to-[#d4af37] text-black font-semibold py-3 px-4 rounded-md transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center shadow-lg hover:shadow-[#d4af37]/50 transform hover:scale-[1.02] active:scale-[0.98]"
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
                  Signing in...
                </>
              ) : (
                'Sign In'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
