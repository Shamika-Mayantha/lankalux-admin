import { NextResponse } from 'next/server'

type ExtractedHotel = {
  name?: string
  address?: string
  price?: string
  images: string[]
  sourceUrl: string
}

function isBookingHost(hostname: string) {
  const h = hostname.toLowerCase()
  return h === 'booking.com' || h.endsWith('.booking.com')
}

function pickJsonLdObjects(html: string): any[] {
  const out: any[] = []
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    const raw = m[1]?.trim()
    if (!raw) continue
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) out.push(...parsed)
      else out.push(parsed)
    } catch {
      // Ignore malformed json-ld chunks.
    }
  }
  return out
}

function firstText(...values: Array<unknown>): string | undefined {
  for (const v of values) {
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return undefined
}

function parseHotelFromJsonLd(jsonLdItems: any[]): Partial<ExtractedHotel> {
  for (const item of jsonLdItems) {
    const t = String(item?.['@type'] || '').toLowerCase()
    if (!t.includes('hotel') && !t.includes('lodgingbusiness')) continue

    const images = (
      Array.isArray(item?.image) ? item.image : typeof item?.image === 'string' ? [item.image] : []
    )
      .filter((x: unknown) => typeof x === 'string' && /^https?:\/\//i.test(x))
      .slice(0, 8)

    const addrObj = item?.address
    const address =
      typeof addrObj === 'string'
        ? addrObj
        : [addrObj?.streetAddress, addrObj?.addressLocality, addrObj?.addressRegion, addrObj?.postalCode, addrObj?.addressCountry]
            .filter((x: unknown) => typeof x === 'string' && x.trim())
            .join(', ')

    const offers = item?.offers
    let price: string | undefined
    if (typeof offers?.price === 'string' || typeof offers?.price === 'number') {
      const currency = typeof offers?.priceCurrency === 'string' ? offers.priceCurrency : ''
      price = `${offers.price}${currency ? ` ${currency}` : ''}`.trim()
    } else if (Array.isArray(offers)) {
      const firstOffer = offers.find((o: any) => o && (o.price || o.priceCurrency))
      if (firstOffer) {
        const currency = typeof firstOffer.priceCurrency === 'string' ? firstOffer.priceCurrency : ''
        price = `${firstOffer.price ?? ''}${currency ? ` ${currency}` : ''}`.trim()
      }
    }

    return {
      name: firstText(item?.name),
      address: firstText(address),
      price: firstText(price, item?.priceRange),
      images,
    }
  }
  return {}
}

function parseOgImages(html: string): string[] {
  const out: string[] = []
  const re = /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["'][^>]*>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    const src = m[1]?.trim()
    if (src && /^https?:\/\//i.test(src)) out.push(src)
  }
  return Array.from(new Set(out))
}

function parseOgTitle(html: string): string | undefined {
  const m = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["'][^>]*>/i)
  if (!m?.[1]) return undefined
  const t = m[1].trim()
  if (!t) return undefined
  return t.replace(/\s*\|\s*Booking\.com\s*$/i, '').trim()
}

function parsePriceMeta(html: string): string | undefined {
  const m = html.match(/<meta[^>]+property=["'](?:product:price:amount|og:price:amount)["'][^>]+content=["']([^"']+)["'][^>]*>/i)
  if (!m?.[1]) return undefined
  const currencyMatch = html.match(/<meta[^>]+property=["'](?:product:price:currency|og:price:currency)["'][^>]+content=["']([^"']+)["'][^>]*>/i)
  const currency = currencyMatch?.[1]?.trim() || ''
  return `${m[1].trim()}${currency ? ` ${currency}` : ''}`.trim()
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const bookingUrl = typeof body?.url === 'string' ? body.url.trim() : ''
    if (!bookingUrl) {
      return NextResponse.json({ error: 'Booking URL is required.' }, { status: 400 })
    }

    let parsedUrl: URL
    try {
      parsedUrl = new URL(bookingUrl)
    } catch {
      return NextResponse.json({ error: 'Invalid URL.' }, { status: 400 })
    }

    if (!isBookingHost(parsedUrl.hostname)) {
      return NextResponse.json({ error: 'Please provide a Booking.com link.' }, { status: 400 })
    }

    const res = await fetch(parsedUrl.toString(), {
      method: 'GET',
      headers: {
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        'accept-language': 'en-US,en;q=0.9',
      },
      cache: 'no-store',
    })

    if (!res.ok) {
      return NextResponse.json({ error: `Could not fetch Booking page (${res.status}).` }, { status: 502 })
    }

    const html = await res.text()
    const jsonLd = pickJsonLdObjects(html)
    const structured = parseHotelFromJsonLd(jsonLd)

    const fallbackName = parseOgTitle(html)
    const fallbackPrice = parsePriceMeta(html)
    const fallbackImages = parseOgImages(html)

    const images = Array.from(new Set([...(structured.images || []), ...fallbackImages])).slice(0, 4)
    const payload: ExtractedHotel = {
      sourceUrl: parsedUrl.toString(),
      name: firstText(structured.name, fallbackName),
      address: firstText(structured.address),
      price: firstText(structured.price, fallbackPrice),
      images,
    }

    if (!payload.name && payload.images.length === 0) {
      return NextResponse.json(
        { error: 'Could not extract hotel details from this Booking link. Please enter details manually.' },
        { status: 422 }
      )
    }

    return NextResponse.json({ success: true, hotel: payload })
  } catch (error) {
    console.error('extract-booking-hotel', error)
    return NextResponse.json(
      { error: 'Failed to extract hotel details. Please try again or enter details manually.' },
      { status: 500 }
    )
  }
}

