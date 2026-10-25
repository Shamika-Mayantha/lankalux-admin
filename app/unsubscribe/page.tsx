import type { Metadata } from 'next'
import { BRAND } from '@/config/brand'
import { lookUpUnsubscribe } from '@/services/unsubscribe.service'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Unsubscribe | LankaLux', robots: { index: false, follow: false } }

const box: React.CSSProperties = {
  maxWidth: 460,
  margin: '12vh auto 0',
  padding: '32px 28px',
  background: '#fff',
  borderRadius: 12,
  boxShadow: '0 1px 3px rgba(0,0,0,.08)',
  fontFamily: 'Arial, sans-serif',
  color: '#252523',
  lineHeight: 1.6,
  textAlign: 'center',
}

/** PUBLIC: the page behind the unsubscribe link in LankaLux marketing emails. */
export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = await searchParams
  const found = await lookUpUnsubscribe(q.t).catch(() => null)
  let body: React.ReactNode
  if (q.error) body = <p>Sorry, something went wrong. Please try again, or reply to our email and we will take you off the list.</p>
  else if (!found || q.bad) body = <p>This link is not valid any more. If you would like us to stop emailing you, just reply to our email and say so.</p>
  else if (found.done)
    body = (
      <>
        <h1 style={{ fontSize: 20, margin: '0 0 8px' }}>You are unsubscribed</h1>
        <p style={{ margin: 0 }}>We will not send {found.email} any more emails like this. If you write to us, we will still reply.</p>
      </>
    )
  else
    body = (
      <form method="post" action="/api/unsubscribe">
        <h1 style={{ fontSize: 20, margin: '0 0 8px' }}>Unsubscribe</h1>
        <p style={{ margin: '0 0 20px' }}>Stop LankaLux emails like this to {found.email}?</p>
        <input type="hidden" name="t" value={q.t} />
        <input type="hidden" name="from" value="page" />
        <button
          type="submit"
          style={{ background: '#1A2A1D', color: '#fff', border: 0, borderRadius: 8, padding: '12px 22px', fontSize: 15, cursor: 'pointer' }}
        >
          Unsubscribe
        </button>
      </form>
    )
  return (
    <main style={{ minHeight: '100vh', background: '#f5f3ee', padding: '0 16px' }}>
      <div style={box}>
        <p style={{ letterSpacing: '.14em', textTransform: 'uppercase', fontSize: 12, color: '#B18544', margin: '0 0 16px' }}>{BRAND.name}</p>
        {body}
      </div>
    </main>
  )
}
