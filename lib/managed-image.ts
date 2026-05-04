export type ManagedImageItem = { src: string; type: 'uploaded' | 'default' }

const IMG_EXT = /\.(jpe?g|png|webp|gif|svg)$/i

function isUploadedSrc(src: string): boolean {
  return src.startsWith('/uploads/') || src.includes('/storage/v1/object/public/')
}

export function normalizeManagedImages(input: unknown): ManagedImageItem[] {
  if (!Array.isArray(input)) return []
  const out: ManagedImageItem[] = []
  for (const item of input) {
    if (typeof item === 'string' && item.trim()) {
      out.push({
        src: item.trim(),
        type: isUploadedSrc(item) ? 'uploaded' : 'default',
      })
    } else if (item && typeof item === 'object' && 'src' in item && typeof (item as { src: unknown }).src === 'string') {
      const src = (item as { src: string }).src.trim()
      if (!src) continue
      const t = (item as { type?: string }).type
      out.push({
        src,
        type: t === 'default' || t === 'uploaded' ? t : isUploadedSrc(src) ? 'uploaded' : 'default',
      })
    }
  }
  return out
}

export function imageSrcs(items: ManagedImageItem[]): string[] {
  return items.map((i) => i.src)
}

/** Absolute URL for email / external clients */
export function absoluteImageSrc(src: string, baseUrl: string): string {
  if (!src) return ''
  if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('data:')) return src
  const b = baseUrl.replace(/\/$/, '')
  return src.startsWith('/') ? `${b}${src}` : `${b}/${src}`
}

export function isImageFilename(name: string): boolean {
  return IMG_EXT.test(name)
}
