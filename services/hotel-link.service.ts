import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import OpenAI from 'openai'
import { openaiModel } from '@/config/env'
import { NO_DASHES_RULE, undash } from '@/lib/no-dashes'
import { AppError } from '@/services/supabase.server'

/**
 * Reads a hotel link (Booking.com, Agoda, TripAdvisor, Google Maps or the hotel's own site)
 * and returns the details staff would otherwise type by hand. Only public page data is used:
 * JSON-LD, meta tags and a slice of the visible text, tidied by the existing OpenAI key.
 * Booking-style sites often block server visits, so the hotel name is also read from the URL.
 */

export type HotelFromLink = {
  sourceUrl: string
  name?: string
  destination?: string
  address?: string
  starCategory?: '3' | '4' | '5' | 'Boutique'
  roomCategory?: string
  mealPlan?: string
  price?: string
  website?: string
  contact?: string
  mapsUrl?: string
  description?: string
  images: string[]
  /** True when the site refused the visit and only the link itself could be read. */
  blocked: boolean
}

const MAX_HTML = 2_000_000
const FETCH_TIMEOUT_MS = 12_000
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

type PageFacts = {
  jsonLd: Record<string, unknown> | null
  meta: Record<string, string>
  text: string
  images: string[]
}

function isPrivateAddress(ip: string): boolean {
  if (ip.includes(':')) {
    const v6 = ip.toLowerCase()
    if (v6.startsWith('::ffff:')) return isPrivateAddress(v6.slice(7))
    return v6 === '::1' || v6 === '::' || v6.startsWith('fc') || v6.startsWith('fd') || v6.startsWith('fe80')
  }
  const [a, b] = ip.split('.').map(Number)
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  )
}

/** Staff paste the link, but the server fetches it, so never let it reach internal addresses. */
async function assertPublicUrl(url: URL) {
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new AppError('Use an http or https link.', 400)
  if (url.username || url.password) throw new AppError('That link is not supported.', 400)
  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new AppError('That link is not supported.', 400)
  }
  let addresses: string[]
  try {
    addresses = isIP(host) ? [host] : (await lookup(host, { all: true })).map((r) => r.address)
  } catch {
    throw new AppError('Could not reach that website. Check the link.', 400)
  }
  if (addresses.length === 0 || addresses.some(isPrivateAddress)) throw new AppError('That link is not supported.', 400)
}

async function fetchPage(start: URL): Promise<{ html: string; finalUrl: URL } | null> {
  let url = start
  for (let hop = 0; hop < 4; hop++) {
    await assertPublicUrl(url)
    let res: Response
    try {
      res = await fetch(url, {
        redirect: 'manual',
        cache: 'no-store',
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: {
          'user-agent': BROWSER_UA,
          accept: 'text/html,application/xhtml+xml',
          'accept-language': 'en-GB,en;q=0.9',
        },
      })
    } catch {
      return null
    }
    const location = res.headers.get('location')
    if (res.status >= 300 && res.status < 400 && location) {
      url = new URL(location, url)
      continue
    }
    // Booking.com answers bots with 202 and a JavaScript challenge page.
    if (res.status !== 200) return null
    if (!(res.headers.get('content-type') || '').includes('html')) return null
    const html = (await res.text()).slice(0, MAX_HTML)
    return { html, finalUrl: url }
  }
  return null
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
}

function flattenJsonLd(node: unknown, out: Record<string, unknown>[]) {
  if (Array.isArray(node)) node.forEach((n) => flattenJsonLd(n, out))
  else if (node && typeof node === 'object') {
    const obj = node as Record<string, unknown>
    out.push(obj)
    if (obj['@graph']) flattenJsonLd(obj['@graph'], out)
  }
}

const LODGING_TYPES = /hotel|lodging|resort|motel|hostel|bedandbreakfast|vacationrental|guesthouse|accommodation/i

function readPage(html: string, baseUrl: URL): PageFacts {
  const items: Record<string, unknown>[] = []
  const ldRe = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let m: RegExpExecArray | null
  while ((m = ldRe.exec(html)) !== null) {
    try {
      flattenJsonLd(JSON.parse(m[1].trim()), items)
    } catch {
      // Malformed JSON-LD is common; skip it.
    }
  }
  const jsonLd = items.find((i) => LODGING_TYPES.test(String(i['@type'] ?? ''))) ?? null

  const meta: Record<string, string> = {}
  const metaRe = /<meta\s[^>]*>/gi
  while ((m = metaRe.exec(html)) !== null) {
    const tag = m[0]
    const key = tag.match(/(?:property|name)=["']([^"']+)["']/i)?.[1]?.toLowerCase()
    const content = tag.match(/content=["']([^"']*)["']/i)?.[1]
    if (key && content && !meta[key]) meta[key] = decodeEntities(content.trim())
  }
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
  if (title) meta.title = decodeEntities(title.trim())

  const images: string[] = []
  const pushImage = (v: unknown) => {
    if (typeof v === 'string') {
      try {
        const src = new URL(v, baseUrl).toString()
        if (/^https:\/\//.test(src)) images.push(src)
      } catch {}
    } else if (v && typeof v === 'object' && 'url' in v) pushImage((v as { url: unknown }).url)
  }
  const ldImage = jsonLd?.image ?? jsonLd?.photo
  ;(Array.isArray(ldImage) ? ldImage : [ldImage]).forEach(pushImage)
  pushImage(meta['og:image'])
  pushImage(meta['twitter:image'])

  const text = decodeEntities(
    html
      .replace(/<(script|style|noscript|svg|nav|footer)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 6000)

  return { jsonLd, meta, text, images: Array.from(new Set(images)).slice(0, 6) }
}

function titleCase(slug: string): string {
  return slug
    .replace(/[-_+]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

/** Works even when the site blocks us: most booking sites put the hotel name in the path. */
export function nameFromUrl(url: URL): string | undefined {
  const host = url.hostname.toLowerCase()
  const path = decodeURIComponent(url.pathname)
  let slug: string | undefined
  if (host.includes('booking.')) slug = path.match(/\/hotel\/[a-z]{2}\/([^/.]+)/i)?.[1]
  else if (host.includes('agoda.')) slug = path.match(/^\/(?:[a-z]{2}-[a-z]{2}\/)?([^/]+)\/hotel\//i)?.[1]
  else if (host.includes('tripadvisor.')) slug = path.match(/-Reviews-([^-]+)-/i)?.[1]
  else if (host.includes('expedia.') || host.includes('hotels.com')) slug = path.match(/\/([^/]+?)(?:\.h\d+)?\.Hotel-Information/i)?.[1]
  else if (host.includes('google.') && path.includes('/maps/place/')) slug = path.match(/\/maps\/place\/([^/@]+)/)?.[1]
  return slug ? titleCase(slug) : undefined
}

function addressText(addr: unknown): string | undefined {
  if (typeof addr === 'string') return addr.trim() || undefined
  if (!addr || typeof addr !== 'object') return undefined
  const a = addr as Record<string, unknown>
  const parts = [a.streetAddress, a.addressLocality, a.addressRegion, a.postalCode, a.addressCountry]
    .map((p) => (typeof p === 'object' && p ? (p as Record<string, unknown>).name : p))
    .filter((p): p is string => typeof p === 'string' && p.trim() !== '')
  return parts.join(', ') || undefined
}

function starsFrom(value: unknown): HotelFromLink['starCategory'] {
  const n = Math.round(Number(typeof value === 'object' && value ? (value as Record<string, unknown>).ratingValue : value))
  if (n === 3 || n === 4 || n === 5) return String(n) as '3' | '4' | '5'
  if (typeof value === 'string' && /boutique/i.test(value)) return 'Boutique'
  return undefined
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined
}

function isBookingSite(host: string) {
  return /(booking|agoda|tripadvisor|expedia|hotels|trivago|airbnb)\./i.test(host)
}

/** Facts straight from structured data, before any AI step. */
function structuredFacts(url: URL, page: PageFacts | null): Omit<HotelFromLink, 'blocked'> {
  const ld = page?.jsonLd ?? {}
  const meta = page?.meta ?? {}
  const ogTitle = str(meta['og:title'])?.replace(/\s*[|·]\s*(Booking\.com|Agoda|Tripadvisor).*$/i, '')
  const offers = Array.isArray(ld.offers) ? ld.offers[0] : ld.offers
  const offer = offers && typeof offers === 'object' ? (offers as Record<string, unknown>) : null
  const price = offer?.price ? `${offer.priceCurrency ?? ''} ${offer.price}`.trim() : str(ld.priceRange)
  const ldUrl = str(ld.url)
  return {
    sourceUrl: url.toString(),
    name: str(ld.name) ?? ogTitle ?? nameFromUrl(url),
    destination: str((ld.address as Record<string, unknown> | undefined)?.addressLocality),
    address: addressText(ld.address),
    starCategory: starsFrom(ld.starRating),
    price,
    website: !isBookingSite(url.hostname) ? `${url.protocol}//${url.hostname}` : ldUrl && !isBookingSite(new URL(ldUrl, url).hostname) ? ldUrl : undefined,
    contact: str(ld.telephone),
    description: str(ld.description) ?? str(meta['og:description']) ?? str(meta.description),
    images: page?.images ?? [],
  }
}

const AI_FIELDS = `{
  "name": string,             // the hotel's proper name
  "destination": string,      // town or area in Sri Lanka, e.g. "Weligama", "Kandy", "Ella"
  "address": string,
  "starCategory": "3" | "4" | "5" | "Boutique" | "",
  "roomCategory": string,     // the best room type named on the page, e.g. "Deluxe Ocean View"
  "mealPlan": string,         // e.g. "Bed and breakfast", only if the page says so
  "contact": string,          // phone and/or email from the page
  "description": string       // 2 or 3 warm sentences for a client, in LankaLux voice
}`

async function tidyWithAi(base: Omit<HotelFromLink, 'blocked'>, page: PageFacts | null): Promise<Partial<HotelFromLink>> {
  const key = process.env.OPENAI_API_KEY
  if (!key) return {}
  const openai = new OpenAI({ apiKey: key })
  const source = page
    ? JSON.stringify({ structured: page.jsonLd, meta: page.meta, pageText: page.text }).slice(0, 12000)
    : 'The site blocked the visit, so only the link and the hotel name are known.'
  try {
    const completion = await openai.chat.completions.create({
      model: openaiModel(),
      temperature: 0.3,
      max_tokens: 700,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'You fill in a hotel record for LankaLux, a Sri Lanka luxury travel company. Reply with one JSON object only. ' +
            'Use facts from the page data. If the page data is missing a fact, you may use well known public facts about this exact hotel ' +
            '(its town, star category), but leave a field as an empty string when you are not sure. Never invent phone numbers, emails, prices or room names. ' +
            'The description must be your own words, never copied from the page. ' +
            NO_DASHES_RULE,
        },
        {
          role: 'user',
          content: `Link: ${base.sourceUrl}\nKnown so far: ${JSON.stringify({ name: base.name, address: base.address })}\n\nPage data:\n${source}\n\nReturn:\n${AI_FIELDS}`,
        },
      ],
    })
    const parsed = JSON.parse(completion.choices[0]?.message?.content || '{}') as Record<string, unknown>
    return {
      name: str(parsed.name),
      destination: str(parsed.destination),
      address: str(parsed.address),
      starCategory: starsFrom(parsed.starCategory) ?? (parsed.starCategory === 'Boutique' ? 'Boutique' : undefined),
      roomCategory: str(parsed.roomCategory),
      mealPlan: str(parsed.mealPlan),
      contact: page ? str(parsed.contact) : undefined,
      description: str(parsed.description) ? undash(str(parsed.description) as string) : undefined,
    }
  } catch (err) {
    console.error('[hotel-link] AI tidy failed', err)
    return {}
  }
}

export async function hotelFromLink(rawUrl: string): Promise<HotelFromLink> {
  let url: URL
  try {
    url = new URL(rawUrl.trim())
  } catch {
    throw new AppError('That does not look like a link.', 400)
  }
  await assertPublicUrl(url)

  const fetched = await fetchPage(url)
  const page = fetched ? readPage(fetched.html, fetched.finalUrl) : null
  const base = structuredFacts(fetched?.finalUrl ?? url, page)
  if (!base.name && !page) {
    throw new AppError('This site blocked the visit and the link has no hotel name in it. Try the hotel\'s own website or its Google Maps link.', 422)
  }

  const ai = await tidyWithAi(base, page)
  // Structured data wins for facts; the AI fills gaps and always writes the description.
  const merged: HotelFromLink = {
    ...base,
    name: base.name ?? ai.name,
    destination: base.destination ?? ai.destination,
    address: base.address ?? ai.address,
    starCategory: base.starCategory ?? ai.starCategory,
    roomCategory: ai.roomCategory,
    mealPlan: ai.mealPlan,
    contact: base.contact ?? ai.contact,
    description: ai.description ?? (base.description ? undash(base.description) : undefined),
    blocked: !page,
  }
  if (/(^|\.)google\./.test(url.hostname) && url.pathname.startsWith('/maps')) {
    merged.mapsUrl = url.toString()
  } else if (merged.name) {
    const q = [merged.name, merged.address || merged.destination || 'Sri Lanka'].join(', ')
    merged.mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`
  }
  return merged
}
