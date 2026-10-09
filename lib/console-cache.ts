'use client'

import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react'

/**
 * Small in-memory stale-while-revalidate store for console pages.
 * Revisiting a page shows the last data straight away and refreshes it in the background,
 * and identical requests fired at the same time share one network call.
 */

type Entry = {
  data?: unknown
  error?: string
  loading: boolean
  fetchedAt: number
  inflight?: Promise<unknown>
}

const EMPTY: Entry = { loading: true, fetchedAt: 0 }
const DEDUPE_MS = 3000
const FOCUS_REFRESH_MS = 30_000

const entries = new Map<string, Entry>()
const listeners = new Map<string, Set<() => void>>()

function setEntry(key: string, next: Entry) {
  entries.set(key, next)
  listeners.get(key)?.forEach((fn) => fn())
}

/** Load `key` once, sharing in-flight calls and reusing data fetched within the last few seconds. */
export function revalidate<T>(key: string, load: () => Promise<T>, opts: { force?: boolean } = {}): Promise<T> {
  const cur = entries.get(key)
  if (cur?.inflight) return cur.inflight as Promise<T>
  if (!opts.force && cur && cur.fetchedAt && Date.now() - cur.fetchedAt < DEDUPE_MS) {
    return Promise.resolve(cur.data as T)
  }
  const inflight = load().then(
    (data) => {
      setEntry(key, { data, loading: false, fetchedAt: Date.now() })
      return data
    },
    (err) => {
      const prev = entries.get(key) || EMPTY
      setEntry(key, {
        data: prev.data,
        fetchedAt: prev.fetchedAt,
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to load',
      })
      throw err
    }
  )
  setEntry(key, { ...(cur || EMPTY), loading: true, inflight })
  return inflight
}

/** Called after any write so the next read goes to the network instead of the dedupe window. */
export function markConsoleCacheStale() {
  // Mutated in place: nothing on screen changes, only the next revalidate skips the dedupe window.
  for (const entry of entries.values()) {
    if (entry.fetchedAt) entry.fetchedAt = 1
  }
}

export function useConsoleResource<T>(key: string | null, load: () => Promise<T>) {
  const loadRef = useRef(load)
  useEffect(() => {
    loadRef.current = load
  })

  const subscribe = useCallback(
    (fn: () => void) => {
      if (!key) return () => {}
      const set = listeners.get(key) || new Set()
      set.add(fn)
      listeners.set(key, set)
      return () => {
        set.delete(fn)
      }
    },
    [key]
  )
  const entry = useSyncExternalStore(
    subscribe,
    () => (key ? entries.get(key) || EMPTY : EMPTY),
    () => EMPTY
  )

  useEffect(() => {
    if (!key) return
    revalidate(key, () => loadRef.current(), { force: true }).catch(() => {})
  }, [key])

  // Pick up new enquiries when coming back to the tab.
  useEffect(() => {
    if (!key) return
    const onFocus = () => {
      if (document.visibilityState !== 'visible') return
      const cur = entries.get(key)
      if (cur && Date.now() - cur.fetchedAt > FOCUS_REFRESH_MS) {
        revalidate(key, () => loadRef.current()).catch(() => {})
      }
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onFocus)
    }
  }, [key])

  const reload = useCallback(
    () => (key ? revalidate(key, () => loadRef.current(), { force: true }) : Promise.resolve(undefined as T)),
    [key]
  )

  return {
    data: entry.data as T | undefined,
    error: entry.error ?? null,
    /** True only on the very first load, when there is nothing to show yet. */
    loading: entry.loading && !entry.fetchedAt,
    refreshing: entry.loading,
    reload,
  }
}
