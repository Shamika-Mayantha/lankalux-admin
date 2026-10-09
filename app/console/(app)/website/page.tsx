'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { consoleFetch } from '@/lib/console-api'
import {
  WEBSITE_ORIGIN,
  WEBSITE_PHOTO_SLOTS,
  WEBSITE_REVIEW_PAGES,
  type WebsitePhotoSlot,
} from '@/config/website-content'

type Review = {
  id: string
  page: string
  quote: string
  author: string
  sort_order: number
  is_visible: boolean
}

type Override = { path: string; image_url: string; updated_at: string }

const MAX_EDGE = 2400

/**
 * Shrink large camera photos in the browser before upload. Keeps uploads under
 * Vercel's request size limit and keeps lankalux.com fast.
 */
async function prepareForUpload(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
    if (scale === 1 && file.size < 1.5 * 1024 * 1024) {
      bitmap.close()
      return file
    }
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85))
    if (!blob) return file
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' })
  } catch {
    return file
  }
}

export default function WebsitePage() {
  const [tab, setTab] = useState<'reviews' | 'photos'>('reviews')
  return (
    <div>
      <h1 className="ll-h1">Website</h1>
      <p className="ll-sub">
        Reviews and photos shown on lankalux.com. Changes appear on the live site within about a minute.
      </p>
      <div className="ll-tabs">
        {(
          [
            ['reviews', 'Reviews'],
            ['photos', 'Photos'],
          ] as const
        ).map(([id, label]) => (
          <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'reviews' ? <ReviewsPanel /> : <PhotosPanel />}
    </div>
  )
}

function ReviewsPanel() {
  const [page, setPage] = useState<string>('home')
  const [reviews, setReviews] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState({ quote: '', author: '' })
  const [editing, setEditing] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    consoleFetch('/api/v2/website/reviews')
      .then((d) => setReviews(d.reviews || []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(load, [load])

  const pageReviews = useMemo(
    () => reviews.filter((r) => r.page === page).sort((a, b) => a.sort_order - b.sort_order),
    [reviews, page],
  )

  async function run(action: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try {
      await action()
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  function patch(id: string, body: Partial<Review>) {
    return consoleFetch(`/api/v2/website/reviews/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
  }

  function addReview(e: React.FormEvent) {
    e.preventDefault()
    run(async () => {
      await consoleFetch('/api/v2/website/reviews', {
        method: 'POST',
        body: JSON.stringify({ page, quote: draft.quote, author: draft.author }),
      })
      setDraft({ quote: '', author: '' })
    })
  }

  function move(index: number, dir: -1 | 1) {
    const other = pageReviews[index + dir]
    const current = pageReviews[index]
    if (!other || !current) return
    run(async () => {
      // Re-number the whole page so equal or missing sort orders cannot stall a move.
      const ordered = [...pageReviews]
      ordered[index] = other
      ordered[index + dir] = current
      await Promise.all(
        ordered.map((r, i) => ((i + 1) * 10 !== r.sort_order ? patch(r.id, { sort_order: (i + 1) * 10 }) : null)),
      )
    })
  }

  const visibleCount = pageReviews.filter((r) => r.is_visible).length

  return (
    <div>
      <div className="ll-row" style={{ marginBottom: 16 }}>
        <div className="ll-form" style={{ minWidth: 260 }}>
          <label>
            Page
            <select value={page} onChange={(e) => setPage(e.target.value)}>
              {WEBSITE_REVIEW_PAGES.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="ll-muted" style={{ margin: 0 }}>
          {visibleCount} shown on the site{visibleCount === 0 ? ' (the site keeps its built-in reviews until at least one is shown)' : ''}
        </p>
      </div>

      {error && <div className="ll-error">{error}</div>}
      {loading && !reviews.length && <p className="ll-muted">Loading reviews…</p>}

      <div style={{ display: 'grid', gap: 12, maxWidth: 880 }}>
        {pageReviews.map((r, i) =>
          editing === r.id ? (
            <ReviewEditor
              key={r.id}
              review={r}
              busy={busy}
              onCancel={() => setEditing(null)}
              onSave={(quote, author) =>
                run(async () => {
                  await patch(r.id, { quote, author })
                  setEditing(null)
                })
              }
            />
          ) : (
            <div className="ll-card" key={r.id} style={{ opacity: r.is_visible ? 1 : 0.55 }}>
              <p style={{ marginTop: 0 }}>“{r.quote}”</p>
              <p className="ll-muted">{r.author}</p>
              <div className="ll-row" style={{ marginTop: 12 }}>
                <button className="ll-btn ghost" disabled={busy || i === 0} onClick={() => move(i, -1)}>
                  ↑ Up
                </button>
                <button
                  className="ll-btn ghost"
                  disabled={busy || i === pageReviews.length - 1}
                  onClick={() => move(i, 1)}
                >
                  ↓ Down
                </button>
                <button className="ll-btn secondary" disabled={busy} onClick={() => setEditing(r.id)}>
                  Edit
                </button>
                <button
                  className="ll-btn secondary"
                  disabled={busy}
                  onClick={() => run(() => patch(r.id, { is_visible: !r.is_visible }))}
                >
                  {r.is_visible ? 'Hide' : 'Show'}
                </button>
                <button
                  className="ll-btn danger"
                  disabled={busy}
                  onClick={() => {
                    if (confirm('Delete this review? This cannot be undone.')) {
                      run(() => consoleFetch(`/api/v2/website/reviews/${r.id}`, { method: 'DELETE' }))
                    }
                  }}
                >
                  Delete
                </button>
                {!r.is_visible && <span className="ll-pill expired">Hidden</span>}
              </div>
            </div>
          ),
        )}
      </div>

      <form className="ll-form ll-card" style={{ marginTop: 24 }} onSubmit={addReview}>
        <h3>Add a review</h3>
        <label>
          Review
          <textarea
            rows={4}
            value={draft.quote}
            onChange={(e) => setDraft((d) => ({ ...d, quote: e.target.value }))}
            placeholder="What the guests said, without quotation marks"
            required
          />
        </label>
        <label>
          Name and country
          <input
            value={draft.author}
            onChange={(e) => setDraft((d) => ({ ...d, author: e.target.value }))}
            placeholder="Emma R, United Kingdom"
            required
          />
        </label>
        <div>
          <button className="ll-btn" type="submit" disabled={busy}>
            Add review
          </button>
        </div>
      </form>
    </div>
  )
}

function ReviewEditor({
  review,
  busy,
  onSave,
  onCancel,
}: {
  review: Review
  busy: boolean
  onSave: (quote: string, author: string) => void
  onCancel: () => void
}) {
  const [quote, setQuote] = useState(review.quote)
  const [author, setAuthor] = useState(review.author)
  return (
    <form
      className="ll-form ll-card"
      onSubmit={(e) => {
        e.preventDefault()
        onSave(quote, author)
      }}
    >
      <label>
        Review
        <textarea rows={4} value={quote} onChange={(e) => setQuote(e.target.value)} required />
      </label>
      <label>
        Name and country
        <input value={author} onChange={(e) => setAuthor(e.target.value)} required />
      </label>
      <div className="ll-row">
        <button className="ll-btn" type="submit" disabled={busy}>
          Save
        </button>
        <button className="ll-btn ghost" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}

function PhotosPanel() {
  const [overrides, setOverrides] = useState<Record<string, Override>>({})
  const [error, setError] = useState<string | null>(null)
  const [busyPath, setBusyPath] = useState<string | null>(null)

  const load = useCallback(() => {
    consoleFetch('/api/v2/website/photos')
      .then((d) => {
        const map: Record<string, Override> = {}
        for (const o of (d.overrides || []) as Override[]) map[o.path] = o
        setOverrides(map)
      })
      .catch((e) => setError(e.message))
  }, [])

  useEffect(load, [load])

  const sections = useMemo(() => {
    const out = new Map<string, WebsitePhotoSlot[]>()
    for (const slot of WEBSITE_PHOTO_SLOTS) {
      if (!out.has(slot.section)) out.set(slot.section, [])
      out.get(slot.section)!.push(slot)
    }
    return [...out.entries()]
  }, [])

  async function replace(slot: WebsitePhotoSlot, file: File) {
    setBusyPath(slot.path)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('path', slot.path)
      fd.append('file', await prepareForUpload(file))
      await consoleFetch('/api/v2/website/photos', { method: 'POST', body: fd })
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.')
    } finally {
      setBusyPath(null)
    }
  }

  async function reset(slot: WebsitePhotoSlot) {
    if (!confirm('Go back to the original photo?')) return
    setBusyPath(slot.path)
    setError(null)
    try {
      await consoleFetch(`/api/v2/website/photos?path=${encodeURIComponent(slot.path)}`, { method: 'DELETE' })
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reset the photo.')
    } finally {
      setBusyPath(null)
    }
  }

  return (
    <div>
      {error && <div className="ll-error">{error}</div>}
      {sections.map(([section, slots]) => (
        <section key={section} style={{ marginBottom: 32 }}>
          <h2 className="ll-card-title" style={{ marginBottom: 12 }}>
            {section}
          </h2>
          <div className="ll-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
            {slots.map((slot) => (
              <PhotoSlotCard
                key={slot.path}
                slot={slot}
                override={overrides[slot.path]}
                busy={busyPath === slot.path}
                onReplace={(file) => replace(slot, file)}
                onReset={() => reset(slot)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function PhotoSlotCard({
  slot,
  override,
  busy,
  onReplace,
  onReset,
}: {
  slot: WebsitePhotoSlot
  override?: Override
  busy: boolean
  onReplace: (file: File) => void
  onReset: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const src = override?.image_url || `${WEBSITE_ORIGIN}/${slot.path}`
  return (
    <div className="ll-card">
      <img src={src} alt={slot.label} className="ll-thumb" loading="lazy" />
      <h3>{slot.label}</h3>
      <p className="ll-muted">Used on: {slot.usedOn.join(', ')}</p>
      {override && <span className="ll-pill new">Replaced</span>}
      <div className="ll-row" style={{ marginTop: 12 }}>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          className="ll-file-hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) onReplace(file)
          }}
        />
        <button className="ll-btn secondary" disabled={busy} onClick={() => inputRef.current?.click()}>
          {busy ? 'Saving…' : 'Replace'}
        </button>
        {override && (
          <button className="ll-btn ghost" disabled={busy} onClick={onReset}>
            Reset to original
          </button>
        )}
      </div>
    </div>
  )
}
