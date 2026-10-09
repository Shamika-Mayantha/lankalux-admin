import { randomUUID } from 'crypto'
import path from 'path'
import { AppError, getServiceClient, isMissingTableError } from '@/services/supabase.server'
import { isWebsitePhotoPath, isWebsiteReviewPage } from '@/config/website-content'

const UPLOAD_BUCKET = process.env.SUPABASE_UPLOADS_BUCKET || 'client-uploads'
const PHOTO_PREFIX = 'website'
const MIGRATION_HINT = 'Website content tables are missing. Run supabase/migrations/20261009000000_website_content.sql.'

export type WebsiteReview = {
  id: string
  page: string
  quote: string
  author: string
  sort_order: number
  is_visible: boolean
}

export type WebsitePhotoOverride = {
  path: string
  image_url: string
  updated_at: string
}

function fail(err: unknown, fallback: string): never {
  if (isMissingTableError(err)) throw new AppError(MIGRATION_HINT, 500)
  const message = err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : fallback
  throw new AppError(message || fallback, 500)
}

function cleanText(value: unknown, field: string, max: number): string {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text) throw new AppError(`${field} is required.`, 400)
  if (text.length > max) throw new AppError(`${field} is too long (max ${max} characters).`, 400)
  return text
}

export async function listReviews(): Promise<WebsiteReview[]> {
  const { data, error } = await getServiceClient()
    .from('website_reviews')
    .select('id, page, quote, author, sort_order, is_visible')
    .order('page')
    .order('sort_order')
    .order('created_at')
  if (error) fail(error, 'Could not load reviews.')
  return (data || []) as WebsiteReview[]
}

export async function createReview(input: Record<string, unknown>): Promise<WebsiteReview> {
  const page = input.page
  if (!isWebsiteReviewPage(page)) throw new AppError('Choose which page the review is for.', 400)
  const supabase = getServiceClient()
  const { data: last } = await supabase
    .from('website_reviews')
    .select('sort_order')
    .eq('page', page)
    .order('sort_order', { ascending: false })
    .limit(1)
  const nextOrder = ((last?.[0]?.sort_order as number | undefined) ?? 0) + 10
  const { data, error } = await supabase
    .from('website_reviews')
    .insert({
      page,
      quote: cleanText(input.quote, 'Review', 2000),
      author: cleanText(input.author, 'Name', 200),
      sort_order: nextOrder,
      is_visible: input.is_visible !== false,
    })
    .select('id, page, quote, author, sort_order, is_visible')
    .single()
  if (error) fail(error, 'Could not save the review.')
  return data as WebsiteReview
}

export async function updateReview(id: string, input: Record<string, unknown>): Promise<WebsiteReview> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if ('quote' in input) patch.quote = cleanText(input.quote, 'Review', 2000)
  if ('author' in input) patch.author = cleanText(input.author, 'Name', 200)
  if ('is_visible' in input) patch.is_visible = input.is_visible === true
  if ('sort_order' in input) {
    const order = Number(input.sort_order)
    if (!Number.isFinite(order)) throw new AppError('Invalid order.', 400)
    patch.sort_order = Math.round(order)
  }
  if ('page' in input) {
    if (!isWebsiteReviewPage(input.page)) throw new AppError('Choose which page the review is for.', 400)
    patch.page = input.page
  }
  const { data, error } = await getServiceClient()
    .from('website_reviews')
    .update(patch)
    .eq('id', id)
    .select('id, page, quote, author, sort_order, is_visible')
    .maybeSingle()
  if (error) fail(error, 'Could not update the review.')
  if (!data) throw new AppError('Review not found.', 404)
  return data as WebsiteReview
}

export async function deleteReview(id: string): Promise<void> {
  const { error } = await getServiceClient().from('website_reviews').delete().eq('id', id)
  if (error) fail(error, 'Could not delete the review.')
}

export async function listPhotoOverrides(): Promise<WebsitePhotoOverride[]> {
  const { data, error } = await getServiceClient().from('website_photos').select('path, image_url, updated_at')
  if (error) fail(error, 'Could not load website photos.')
  return (data || []) as WebsitePhotoOverride[]
}

function safeExtension(originalName: string, mimeType: string) {
  const ext = path.extname(originalName || '').replace(/[^a-z0-9.]/gi, '').toLowerCase()
  if (['.jpg', '.jpeg', '.png', '.webp', '.avif'].includes(ext)) return ext
  if (mimeType.includes('png')) return '.png'
  if (mimeType.includes('webp')) return '.webp'
  if (mimeType.includes('avif')) return '.avif'
  return '.jpg'
}

async function uploadWebsitePhoto(buf: Buffer, originalName: string, mime: string): Promise<string> {
  const supabase = getServiceClient()
  const objectPath = `${PHOTO_PREFIX}/${randomUUID()}${safeExtension(originalName, mime)}`
  const upload = () =>
    supabase.storage.from(UPLOAD_BUCKET).upload(objectPath, buf, {
      contentType: mime,
      cacheControl: '31536000',
      upsert: false,
    })
  let res = await upload()
  if (res.error && res.error.message?.toLowerCase().includes('bucket')) {
    await supabase.storage.createBucket(UPLOAD_BUCKET, { public: true })
    res = await upload()
  }
  if (res.error) throw new AppError(res.error.message || 'Upload failed.', 500)
  const url = supabase.storage.from(UPLOAD_BUCKET).getPublicUrl(objectPath).data.publicUrl
  if (!url) throw new AppError('Could not resolve uploaded image URL.', 500)
  return url
}

export async function replacePhoto(slotPath: string, file: Blob & { name?: string }): Promise<WebsitePhotoOverride> {
  if (!isWebsitePhotoPath(slotPath)) throw new AppError('Unknown website photo.', 400)
  const mime = (file.type || '').toLowerCase()
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(mime)) {
    throw new AppError('Upload a JPG, PNG, WebP or AVIF photo.', 400)
  }
  const buf = Buffer.from(await file.arrayBuffer())
  if (buf.length > 12 * 1024 * 1024) throw new AppError('File too large (max 12MB).', 400)
  const imageUrl = await uploadWebsitePhoto(buf, file.name || 'photo.jpg', mime)
  const { data, error } = await getServiceClient()
    .from('website_photos')
    .upsert({ path: slotPath, image_url: imageUrl, updated_at: new Date().toISOString() })
    .select('path, image_url, updated_at')
    .single()
  if (error) fail(error, 'Could not save the photo.')
  return data as WebsitePhotoOverride
}

export async function resetPhoto(slotPath: string): Promise<void> {
  if (!isWebsitePhotoPath(slotPath)) throw new AppError('Unknown website photo.', 400)
  const { error } = await getServiceClient().from('website_photos').delete().eq('path', slotPath)
  if (error) fail(error, 'Could not reset the photo.')
}

/** Published content for lankalux.com: visible reviews grouped by page, and photo overrides keyed by original path. */
export async function getPublishedSiteContent() {
  const supabase = getServiceClient()
  const [reviewsRes, photosRes] = await Promise.all([
    supabase
      .from('website_reviews')
      .select('page, quote, author')
      .eq('is_visible', true)
      .order('sort_order')
      .order('created_at'),
    supabase.from('website_photos').select('path, image_url'),
  ])
  if (reviewsRes.error) fail(reviewsRes.error, 'Could not load reviews.')
  if (photosRes.error) fail(photosRes.error, 'Could not load photos.')
  const reviews: Record<string, { quote: string; author: string }[]> = {}
  for (const row of reviewsRes.data || []) {
    ;(reviews[row.page] ||= []).push({ quote: row.quote, author: row.author })
  }
  const photos: Record<string, string> = {}
  for (const row of photosRes.data || []) {
    if (isWebsitePhotoPath(row.path)) photos[row.path] = row.image_url
  }
  return { reviews, photos }
}
