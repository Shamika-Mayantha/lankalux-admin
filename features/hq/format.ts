/** Small helpers shared by the Headquarters' screens. */

export const REPLAY_SPEEDS = [30, 120, 600] as const

/** How long a pulse of light between two agents lasts, in ms. Kept here so the page can time pulses without loading three.js. */
export const PULSE_MS = 2200

export type HqMode = { kind: 'live' } | { kind: 'replay'; at: number; speed: number; playing: boolean }

/** "45s", "12 min", "3 h 5 min". */
export function ago(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s}s`
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  return `${h} h ${m % 60} min`
}

/** Sri Lanka clock time, "14:05". */
export function clock(t: number): string {
  return new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Colombo' })
}
