import { NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'
import { randomUUID } from 'crypto'
import { createClient } from '@supabase/supabase-js'

const UPLOAD_BUCKET = process.env.SUPABASE_UPLOADS_BUCKET || 'client-uploads'

function safeExtension(originalName: string, mimeType: string) {
  const ext = path.extname(originalName || '').replace(/[^a-z0-9.]/gi, '').toLowerCase()
  if (ext && ext.length <= 6) return ext
  if (mimeType.includes('png')) return '.png'
  if (mimeType.includes('webp')) return '.webp'
  if (mimeType.includes('gif')) return '.gif'
  return '.jpg'
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const file = formData.get('file')
    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ error: 'No file' }, { status: 400 })
    }

    const buf = Buffer.from(await file.arrayBuffer())
    if (buf.length > 12 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large (max 12MB)' }, { status: 400 })
    }

    const mime = ((file as File).type || '').toLowerCase()
    if (!mime.startsWith('image/')) {
      return NextResponse.json({ error: 'Only image uploads are allowed.' }, { status: 400 })
    }

    const original = (file as File).name || 'image.jpg'
    const ext = safeExtension(original, mime)
    const name = `${randomUUID()}${ext}`

    // Prefer durable object storage so uploads work from any device/session.
    if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      )

      const objectPath = `client-images/${name}`
      const uploadRes = await supabase.storage
        .from(UPLOAD_BUCKET)
        .upload(objectPath, buf, { contentType: mime, upsert: false })

      if (uploadRes.error) {
        // Try to create bucket once (public read) if it does not exist yet.
        if (uploadRes.error.message?.toLowerCase().includes('bucket')) {
          const createRes = await supabase.storage.createBucket(UPLOAD_BUCKET, { public: true })
          if (!createRes.error) {
            const retry = await supabase.storage
              .from(UPLOAD_BUCKET)
              .upload(objectPath, buf, { contentType: mime, upsert: false })
            if (retry.error) {
              throw retry.error
            }
          } else {
            throw createRes.error
          }
        } else {
          throw uploadRes.error
        }
      }

      const { data } = supabase.storage.from(UPLOAD_BUCKET).getPublicUrl(objectPath)
      const src = data?.publicUrl
      if (!src) throw new Error('Could not resolve uploaded image URL.')
      return NextResponse.json({ src, type: 'uploaded' as const })
    }

    // Local fallback (mainly for local development environments).
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads')
    await mkdir(uploadsDir, { recursive: true })
    const filePath = path.join(uploadsDir, name)
    await writeFile(filePath, buf)
    return NextResponse.json({ src: `/uploads/${name}`, type: 'uploaded' as const })
  } catch (e) {
    console.error('upload-client-image', e)
    return NextResponse.json(
      {
        error: 'Upload failed. Please try again. If this continues, check storage configuration.',
      },
      { status: 500 }
    )
  }
}
