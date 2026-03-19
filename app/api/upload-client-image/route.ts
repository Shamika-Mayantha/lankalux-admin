import { NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'
import { randomUUID } from 'crypto'

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

    const original = (file as File).name || 'image.jpg'
    const ext = path.extname(original).replace(/[^a-z0-9.]/gi, '') || '.jpg'
    const safeExt = ext.length > 6 ? '.jpg' : ext
    const name = `${randomUUID()}${safeExt}`

    const uploadsDir = path.join(process.cwd(), 'public', 'uploads')
    await mkdir(uploadsDir, { recursive: true })
    const filePath = path.join(uploadsDir, name)
    await writeFile(filePath, buf)

    const src = `/uploads/${name}`
    return NextResponse.json({ src, type: 'uploaded' as const })
  } catch (e) {
    console.error('upload-client-image', e)
    return NextResponse.json(
      {
        error:
          'Upload failed. On serverless hosts, configure object storage or run locally so /public/uploads is writable.',
      },
      { status: 500 }
    )
  }
}
