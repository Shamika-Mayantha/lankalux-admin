import { pdf, type DocumentProps } from '@react-pdf/renderer'
import type { ReactElement } from 'react'
import JSZip from 'jszip'
import QRCode from 'qrcode'
import { BRAND } from '@/config/brand'
import { registerLankaLuxDocumentFonts } from '@/lib/driver-pack/registerFonts'
import type { DriverPackData } from '@/lib/driver-pack/buildDriverPackData'

export async function loadBrandLogoDataUrl() {
  const sources = [BRAND.logoSrc, BRAND.logoStackedSrc, 'https://lankalux.com/lankalux-logo.png']
  for (const src of sources) {
    try {
      const res = await fetch(src)
      if (!res.ok) continue
      const blob = await res.blob()
      if (!blob.size) continue
      return await blobToDataUrl(blob)
    } catch {
      /* try next */
    }
  }
  return null
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

export async function mapsQrDataUrl(mapsUrl: string) {
  const url = String(mapsUrl || '').trim()
  if (!url) return ''
  return QRCode.toDataURL(url, {
    margin: 1,
    width: 280,
    color: { dark: '#1A2A1D', light: '#F9F4EB' },
  })
}

export async function attachHotelQrCodes(data: DriverPackData): Promise<DriverPackData> {
  const days = await Promise.all(
    data.days.map(async (day) => {
      if (!day.hotel?.mapsUrl) return day
      const qrDataUrl = await mapsQrDataUrl(day.hotel.mapsUrl)
      return { ...day, hotel: { ...day.hotel, qrDataUrl } }
    })
  )
  return { ...data, days }
}

export async function renderPdfBlob(document: ReactElement<DocumentProps>) {
  registerLankaLuxDocumentFonts()
  return pdf(document).toBlob()
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = window.document.createElement('a')
  link.href = url
  link.download = filename
  window.document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1500)
}

export async function zipPdfs(files: Array<{ name: string; blob: Blob }>) {
  const zip = new JSZip()
  for (const file of files) zip.file(file.name, file.blob)
  return zip.generateAsync({ type: 'blob' })
}
