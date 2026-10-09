import { jsonErr, jsonOk, requireAdmin } from '@/app/api/v2/_guard'
import { AppError } from '@/services/supabase.server'
import { listPhotoOverrides, replacePhoto, resetPhoto } from '@/services/website-content.service'

export async function GET(request: Request) {
  try {
    await requireAdmin(request)
    return jsonOk({ overrides: await listPhotoOverrides() })
  } catch (err) {
    return jsonErr(err, 'Could not load website photos.')
  }
}

/** Multipart: `path` (original website image path) + `file` (the new photo). */
export async function POST(request: Request) {
  try {
    await requireAdmin(request)
    const form = await request.formData()
    const slotPath = form.get('path')
    const file = form.get('file')
    if (typeof slotPath !== 'string' || !slotPath) throw new AppError('Missing photo path.', 400)
    if (!file || !(file instanceof Blob)) throw new AppError('Choose a photo to upload.', 400)
    return jsonOk({ override: await replacePhoto(slotPath, file as Blob & { name?: string }) })
  } catch (err) {
    return jsonErr(err, 'Upload failed.')
  }
}

export async function DELETE(request: Request) {
  try {
    await requireAdmin(request)
    const slotPath = new URL(request.url).searchParams.get('path') || ''
    await resetPhoto(slotPath)
    return jsonOk({ reset: true })
  } catch (err) {
    return jsonErr(err, 'Could not reset the photo.')
  }
}
