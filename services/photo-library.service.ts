import { getServiceClient } from '@/services/supabase.server'

/**
 * Photos a supervisor removed from the itinerary photo picker. Uploaded photos are deleted from
 * storage; built-in library photos (files in the app) cannot be deleted, so they are listed here
 * and left out of the picker. The list is a small JSON file in the uploads bucket.
 */
const UPLOAD_BUCKET = process.env.SUPABASE_UPLOADS_BUCKET || 'client-uploads'
const UPLOAD_PREFIX = 'client-images/'
const HIDDEN_FILE = 'settings/hidden-photos.json'

export async function hiddenPhotos(): Promise<string[]> {
  try {
    const { data, error } = await getServiceClient().storage.from(UPLOAD_BUCKET).download(HIDDEN_FILE)
    if (error || !data) return []
    const list = JSON.parse(await data.text())
    return Array.isArray(list) ? list.filter((s): s is string => typeof s === 'string') : []
  } catch {
    return []
  }
}

async function saveHidden(list: string[]) {
  const body = new Blob([JSON.stringify(Array.from(new Set(list)))], { type: 'application/json' })
  const { error } = await getServiceClient().storage.from(UPLOAD_BUCKET).upload(HIDDEN_FILE, body, { upsert: true, contentType: 'application/json' })
  if (error) throw new Error(error.message)
}

/** Removes a photo from the picker: deletes an uploaded one, hides a built-in one. */
export async function removePhoto(src: string): Promise<'deleted' | 'hidden'> {
  const supabase = getServiceClient()
  const marker = `/storage/v1/object/public/${UPLOAD_BUCKET}/`
  const at = src.indexOf(marker)
  const objectPath = at >= 0 ? decodeURIComponent(src.slice(at + marker.length).split('?')[0]) : ''
  if (objectPath.startsWith(UPLOAD_PREFIX)) {
    const { error } = await supabase.storage.from(UPLOAD_BUCKET).remove([objectPath])
    if (error) throw new Error(error.message)
    return 'deleted'
  }
  await saveHidden([...(await hiddenPhotos()), src])
  return 'hidden'
}
