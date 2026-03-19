import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { isImageFilename } from '@/lib/managed-image'

export async function GET() {
  try {
    const imagesRoot = path.join(process.cwd(), 'public', 'images')
    if (!fs.existsSync(imagesRoot)) {
      return NextResponse.json({ paths: [] as string[] })
    }

    const paths: string[] = []

    function walk(dir: string) {
      const entries = fs.readdirSync(dir, { withFileTypes: true })
      for (const ent of entries) {
        const full = path.join(dir, ent.name)
        if (ent.isDirectory()) {
          if (ent.name.startsWith('.')) continue
          walk(full)
        } else if (ent.isFile() && isImageFilename(ent.name)) {
          const rel = path.relative(imagesRoot, full).replace(/\\/g, '/')
          paths.push(`/images/${rel}`)
        }
      }
    }

    walk(imagesRoot)
    paths.sort()
    return NextResponse.json({ paths })
  } catch (e) {
    console.error('image-library', e)
    return NextResponse.json({ paths: [] as string[], error: 'Failed to list images' }, { status: 500 })
  }
}
