export function googleMapsSearchUrl(name: string, address?: string | null) {
  const query = [name, address].map((part) => String(part || '').trim()).filter(Boolean).join(', ')
  if (!query) return ''
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
}

export function looksLikeMapsUrl(value: string | null | undefined) {
  const url = String(value || '').trim().toLowerCase()
  return url.includes('google.com/maps') || url.includes('maps.app.goo.gl') || url.includes('goo.gl/maps')
}
