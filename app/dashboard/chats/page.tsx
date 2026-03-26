'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface ChatSession {
  session_id: string
  client_name: string | null
  email: string | null
  whatsapp: string | null
  request_id: string | null
  selected_vehicle: string | null
  last_user_message: string | null
  last_assistant_message: string | null
  message_count: number | null
  messages_json: Array<{ role: 'user' | 'assistant'; content: string; kind?: string }> | null
  handoff_requested: boolean | null
  last_event: string | null
  updated_at: string
  created_at: string
}

export default function ChatsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<ChatSession[]>([])
  const [refreshing, setRefreshing] = useState(false)

  const checkSession = useCallback(async () => {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession()
    if (error || !session?.user) {
      router.push('/login')
      return false
    }
    return true
  }, [router])

  const loadChats = useCallback(async () => {
    try {
      setRefreshing(true)
      const { data, error } = await supabase
        .from('website_chat_sessions')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(200)
      if (error) {
        console.error('Error loading chats:', error)
        setRows([])
      } else {
        setRows((data || []) as ChatSession[])
      }
    } finally {
      setRefreshing(false)
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    ;(async () => {
      const ok = await checkSession()
      if (!ok) return
      await loadChats()
    })()
  }, [checkSession, loadChats])

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleString()
    } catch {
      return iso
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-page text-primary flex items-center justify-center">
        <div className="text-secondary">Loading chats...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-page text-primary transition-colors duration-300">
      <div className="w-full mx-auto px-6 sm:px-10 lg:px-14 xl:px-20 py-10">
        <div className="flex flex-wrap justify-between items-center gap-4 mb-8 bg-card border border-theme rounded-2xl px-6 py-5 shadow-card">
          <div>
            <h1 className="text-2xl font-bold">Chat Sessions</h1>
            <p className="text-secondary text-sm">Live website conversations captured for agent follow-up.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push('/dashboard')}
              className="px-4 py-2.5 bg-[var(--bg-btn-secondary)] hover:bg-[var(--bg-btn-secondary-hover)] border border-theme rounded-xl text-sm"
            >
              Back to Dashboard
            </button>
            <button
              onClick={loadChats}
              disabled={refreshing}
              className="px-4 py-2.5 bg-[var(--accent-gold)] hover:bg-[var(--accent-gold-hover)] border border-[var(--accent-gold)] text-black font-semibold rounded-xl text-sm disabled:opacity-50"
            >
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="bg-card border border-theme rounded-2xl p-10 text-secondary">No chat sessions yet.</div>
        ) : (
          <div className="space-y-4">
            {rows.map((row) => (
              <details key={row.session_id} className="bg-card border border-theme rounded-2xl p-5 shadow-card">
                <summary className="cursor-pointer list-none">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <h3 className="font-semibold text-lg">{row.client_name || 'Unknown visitor'}</h3>
                      <p className="text-sm text-secondary mt-1">
                        {row.email || 'No email'} {row.request_id ? `• ${row.request_id}` : ''}{' '}
                        {row.handoff_requested ? '• WhatsApp handoff requested' : ''}
                      </p>
                      <p className="text-sm text-secondary mt-1 line-clamp-2">
                        {row.last_user_message || row.last_assistant_message || 'No message preview'}
                      </p>
                    </div>
                    <div className="text-right text-sm text-secondary">
                      <div>{row.message_count || 0} msgs</div>
                      <div>{formatDate(row.updated_at)}</div>
                    </div>
                  </div>
                </summary>
                <div className="mt-4 border-t border-theme pt-4 space-y-3">
                  {row.selected_vehicle && (
                    <p className="text-sm">
                      <span className="text-secondary">Selected vehicle: </span>
                      {row.selected_vehicle}
                    </p>
                  )}
                  {(row.messages_json || []).map((m, idx) => (
                    <div
                      key={`${row.session_id}-${idx}`}
                      className={`rounded-xl px-3 py-2 text-sm ${
                        m.role === 'user'
                          ? 'bg-[var(--bg-btn-secondary)] border border-theme'
                          : 'bg-amber-950/20 border border-amber-700/20'
                      }`}
                    >
                      <span className="text-secondary mr-2">{m.role === 'user' ? 'Guest' : 'LankaLux Live Chat'}:</span>
                      <span>{m.content}</span>
                    </div>
                  ))}
                </div>
              </details>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

