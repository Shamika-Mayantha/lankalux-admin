import { mkdir, writeFile } from 'fs/promises'
import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import { jsonErr, jsonOk, readJson, requireAdmin, requireStaff } from '@/app/api/v2/_guard'
import { hiddenPhotos, removePhoto } from '@/services/photo-library.service'
import { isSupervisor } from '@/services/staff.service'
import { AppError, getServiceClient } from '@/services/supabase.server'
import { isImageFilename } from '@/lib/managed-image'

const UPLOAD_BUCKET = process.env.SUPABASE_UPLOADS_BUCKET || 'client-uploads'
const PREFIX = 'client-images'

function safeExtension(originalName: string, mimeType: string) {
  const ext = path.extname(originalName || '').replace(/[^a-z0-9.]/gi, '').toLowerCase()
  if (ext && ext.length <= 6) return ext
  if (mimeType.includes('png')) return '.png'
  if (mimeType.includes('webp')) return '.webp'
  if (mimeType.includes('gif')) return '.gif'
  return '.jpg'
}

function localUploadPaths(): string[] {
  const uploadsDir = path.join(process.cwd(), 'public', 'uploads')
  if (!fs.existsSync(uploadsDir)) return []
  return fs
    .readdirSync(uploadsDir)
    .filter((name) => isImageFilename(name))
    .map((name) => `/uploads/${name}`)
    .reverse()
}

async function listStorageUploads(): Promise<string[]> {
  try {
    const supabase = getServiceClient()
    const { data, error } = await supabase.storage.from(UPLOAD_BUCKET).list(PREFIX, {
      limit: 200,
      sortBy: { column: 'created_at', order: 'desc' },
    })
    if (error) return []
    return (data || [])
      .filter((item) => item.name && isImageFilename(item.name) && !item.name.startsWith('.'))
      .map((item) => supabase.storage.from(UPLOAD_BUCKET).getPublicUrl(`${PREFIX}/${item.name}`).data.publicUrl)
      .filter(Boolean)
  } catch {
    return []
  }
}

async function saveLocally(buf: Buffer, originalName: string, mime: string): Promise<string> {
  const uploadsDir = path.join(process.cwd(), 'public', 'uploads')
  await mkdir(uploadsDir, { recursive: true })
  const filename = `${randomUUID()}${safeExtension(originalName, mime)}`
  await writeFile(path.join(uploadsDir, filename), buf)
  return `/uploads/${filename}`
}

async function saveToStorage(buf: Buffer, originalName: string, mime: string): Promise<string | null> {
  const supabase = getServiceClient()
  const objectPath = `${PREFIX}/${randomUUID()}${safeExtension(originalName, mime)}`
  const uploadRes = await supabase.storage.from(UPLOAD_BUCKET).upload(objectPath, buf, {
    contentType: mime,
    upsert: false,
  })

  if (uploadRes.error) {
    if (!uploadRes.error.message?.toLowerCase().includes('bucket')) {
      throw new AppError(uploadRes.error.message, 500)
    }
    const createRes = await supabase.storage.createBucket(UPLOAD_BUCKET, { public: true })
    if (createRes.error) return null
    const retry = await supabase.storage.from(UPLOAD_BUCKET).upload(objectPath, buf, {
      contentType: mime,
      upsert: false,
    })
    if (retry.error) throw new AppError(retry.error.message, 500)
  }

  return supabase.storage.from(UPLOAD_BUCKET).getPublicUrl(objectPath).data.publicUrl || null
}

export async function GET(request: Request) {
  try {
    const staff = await requireStaff(request)
    const [stored, hidden] = await Promise.all([listStorageUploads(), hiddenPhotos()])
    const uploaded = [...stored, ...localUploadPaths()]
    const seen = new Set<string>()
    const paths: string[] = []
    for (const src of uploaded) {
      if (!src || seen.has(src)) continue
      seen.add(src)
      paths.push(src)
    }
    return jsonOk({ paths: paths.filter((src) => !hidden.includes(src)), hidden, canDelete: isSupervisor(staff) })
  } catch (err) {
    return jsonErr(err, 'Could not load uploaded photos.')
  }
}

/** Supervisors only: take a photo out of the picker (uploads are deleted, built-in photos hidden). */
export async function DELETE(request: Request) {
  try {
    await requireAdmin(request)
    const { src } = await readJson<{ src?: string }>(request)
    if (!src || typeof src !== 'string') throw new AppError('Choose a photo to remove.', 400)
    const result = await removePhoto(src)
    return jsonOk({ result })
  } catch (err) {
    return jsonErr(err, 'Could not remove the photo.')
  }
}

export async function POST(request: Request) {
  try {
    await requireStaff(request)
    const formData = await request.formData()
    const file = formData.get('file')
    if (!file || !(file instanceof Blob)) {
      throw new AppError('Choose a photo to upload.', 400)
    }

    const buf = Buffer.from(await file.arrayBuffer())
    if (buf.length > 12 * 1024 * 1024) {
      throw new AppError('File too large (max 12MB).', 400)
    }

    const mime = ((file as File).type || '').toLowerCase()
    if (!mime.startsWith('image/')) {
      throw new AppError('Only image uploads are allowed.', 400)
    }

    const original = (file as File).name || 'image.jpg'
    let src: string | null = null
    try {
      src = await saveToStorage(buf, original, mime)
    } catch (err) {
      if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) throw err
      src = await saveLocally(buf, original, mime)
    }
    if (!src) {
      if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
        throw new AppError('Could not resolve uploaded image URL.', 500)
      }
      src = await saveLocally(buf, original, mime)
    }

    return jsonOk({ src, type: 'uploaded' as const })
  } catch (err) {
    return jsonErr(err, 'Upload failed.')
  }
}
