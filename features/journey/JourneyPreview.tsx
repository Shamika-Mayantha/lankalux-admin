'use client'

import { useRef, useState } from 'react'
import { Download, Copy, Check } from 'lucide-react'
import { consoleFetch } from '@/lib/console-api'
import { JourneyView } from './JourneyView'
import type { CanonicalJourney } from '@/types/domain'

export function JourneyPreview({ journey, onClose }: { journey: CanonicalJourney; onClose: () => void }) {
  const content = useRef<HTMLDivElement>(null)
  const [busy, setBusy] = useState<'pdf' | 'link' | null>(null)
  const [error, setError] = useState('')
  const [shareUrl, setShareUrl] = useState('')
  const [copied, setCopied] = useState(false)

  async function download() {
    const root = content.current?.querySelector<HTMLElement>('.journey-root')
    if (!root) return
    setBusy('pdf')
    setError('')
    try {
      const { downloadJourneyPdf } = await import('@/lib/journey-pdf')
      await downloadJourneyPdf(root, `LankaLux - ${journey.clientName} - ${journey.title}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not download the PDF. Please try again.')
    } finally { setBusy(null) }
  }

  async function copyLink() {
    setBusy('link')
    setError('')
    setCopied(false)
    try {
      const url = shareUrl || (await consoleFetch('/api/v2/preview-share', {
        method: 'POST', body: JSON.stringify({ journey }),
      })).url
      if (typeof url !== 'string' || !url) throw new Error('Could not create the itinerary link.')
      setShareUrl(url)
      try {
        await navigator.clipboard.writeText(url)
        setCopied(true)
      } catch {
        setError('Your browser could not copy automatically. Select and copy the link below.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not copy the link. Please try again.')
    } finally { setBusy(null) }
  }

  return (
    <div className="ll-modal-back" onClick={() => !busy && onClose()}>
      <div className="ll-modal" role="dialog" aria-modal="true" aria-label="Itinerary preview" style={{ maxWidth: 820, padding: 0 }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: 12, position: 'sticky', top: 0, zIndex: 2, background: '#f9f4eb', borderBottom: '1px solid rgba(26,42,29,.12)' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8 }}>
            <button className="ll-btn secondary" disabled={!!busy} onClick={download}>
              <Download size={16} /> {busy === 'pdf' ? 'Preparing PDF…' : 'Download PDF'}
            </button>
            <button className="ll-btn secondary" disabled={!!busy} onClick={copyLink}>
              {copied ? <Check size={16} /> : <Copy size={16} />} {busy === 'link' ? 'Creating link…' : copied ? 'Link copied' : 'Copy link'}
            </button>
            <button className="ll-btn secondary" disabled={!!busy} onClick={onClose}>Close preview</button>
          </div>
          {error && <p role="alert" style={{ margin: '8px 0 0', color: '#9b3d3d' }}>{error}</p>}
          {shareUrl && !copied && <input aria-label="Itinerary share link" readOnly value={shareUrl} onFocus={e => e.target.select()} style={{ width: '100%', marginTop: 8 }} />}
          {busy && <span role="status" className="ll-muted">{busy === 'pdf' ? 'Preparing your itinerary with its photos and colours…' : 'Preparing this itinerary link…'}</span>}
        </div>
        <div ref={content}><JourneyView journey={journey} showDistance={false} /></div>
      </div>
    </div>
  )
}
