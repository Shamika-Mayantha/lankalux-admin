/** YYYY-MM-DD comparison. If end is before start, snap end to start. */
export function clampEndOnOrAfterStart(start: string, end: string): string {
  if (start && end && end < start) return start
  return end
}
