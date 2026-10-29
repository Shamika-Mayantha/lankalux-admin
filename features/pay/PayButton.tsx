'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Revolut refuses to load inside another page, so checkout opens in a small window over ours.
 * Phones and popup blockers get a normal new tab instead. Card details stay on Revolut.
 */
export function PayButton({ url, amountLabel }: { url: string; amountLabel: string }) {
  const [state, setState] = useState<'idle' | 'open' | 'closed'>('idle')
  const popup = useRef<Window | null>(null)

  useEffect(() => {
    if (state !== 'open') return
    const timer = window.setInterval(() => {
      if (!popup.current || popup.current.closed) {
        popup.current = null
        setState('closed')
      }
    }, 800)
    return () => window.clearInterval(timer)
  }, [state])

  function open() {
    if (popup.current && !popup.current.closed) {
      popup.current.focus()
      return
    }
    const w = 480
    const h = Math.min(780, window.screen.availHeight - 40)
    const left = Math.max(0, window.screenX + (window.outerWidth - w) / 2)
    const top = Math.max(0, window.screenY + (window.outerHeight - h) / 2)
    const win = window.open(url, 'lankalux-revolut', `popup=yes,width=${w},height=${h},left=${left},top=${top}`)
    if (!win) {
      window.open(url, '_blank', 'noopener')
      setState('closed')
      return
    }
    popup.current = win
    setState('open')
  }

  if (state === 'open') {
    return (
      <div className="ll-pay-state wait" role="status">
        <span className="ll-pay-spinner" aria-hidden />
        <strong>Complete your payment in the Revolut window</strong>
        <span>Keep this page open. Can&apos;t see the window?</span>
        <button type="button" className="ll-pay-link" onClick={open}>
          Bring it back
        </button>
      </div>
    )
  }

  return (
    <div className="ll-pay-action">
      <button type="button" className="ll-pay-btn" onClick={open}>
        Pay {amountLabel} securely
      </button>
      {state === 'closed' ? (
        <p className="ll-pay-muted ll-pay-after">
          Finished? We&apos;ll confirm by email once your payment reaches us. If it didn&apos;t go through, tap the button to try
          again.
        </p>
      ) : (
        <p className="ll-pay-muted ll-pay-after">Opens Revolut&apos;s secure checkout in a small window.</p>
      )}
    </div>
  )
}
