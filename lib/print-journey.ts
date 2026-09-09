'use client'

import html2canvas from 'html2canvas'
import { PDFDocument, rgb } from 'pdf-lib'

const IVORY = '#f9f4eb'
const IVORY_RGB = rgb(249 / 255, 244 / 255, 235 / 255)
const A4_WIDTH_PT = 595.28
const A4_HEIGHT_PT = 841.89
const MARGIN_PT = 28

function waitForImages(root: ParentNode, timeoutMs = 12000): Promise<void> {
  const images = Array.from(root.querySelectorAll('img'))
  if (!images.length) return Promise.resolve()
  return new Promise((resolve) => {
    let remaining = images.length
    const done = () => {
      remaining -= 1
      if (remaining <= 0) resolve()
    }
    const timer = window.setTimeout(resolve, timeoutMs)
    images.forEach((img) => {
      if (img.complete) {
        done()
        return
      }
      img.addEventListener('load', done, { once: true })
      img.addEventListener('error', done, { once: true })
    })
    if (remaining <= 0) {
      window.clearTimeout(timer)
      resolve()
    }
  })
}

function absolutizeUrls(root: HTMLElement, base: string) {
  root.querySelectorAll('img').forEach((img) => {
    const src = img.getAttribute('src')
    if (!src) return
    try {
      const abs = new URL(src, base).href
      img.setAttribute('src', abs)
      img.setAttribute('crossorigin', 'anonymous')
    } catch {
      /* keep original */
    }
  })
}

function slugifyFilename(title: string) {
  const base = title
    .replace(/\s·\sLankaLux$/i, '')
    .replace(/[^\w\s-]+/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 80)
  return `${base || 'lankalux-itinerary'}.pdf`
}

function collectBreakYs(root: HTMLElement, scale: number): number[] {
  const rootRect = root.getBoundingClientRect()
  const points = [0]
  root
    .querySelectorAll(
      '.journey-hero, .journey-day, .journey-footer, .journey-footer section, .journey-hotel, .journey-photo-wrap, .journey-contact'
    )
    .forEach((el) => {
      const r = el.getBoundingClientRect()
      const y = Math.max(0, Math.round((r.top - rootRect.top) * scale))
      if (y > 0) points.push(y)
    })
  return Array.from(new Set(points)).sort((a, b) => a - b)
}

function nextSliceEnd(start: number, maxEnd: number, breaks: number[], totalHeight: number): number {
  const hardEnd = Math.min(maxEnd, totalHeight)
  if (hardEnd >= totalHeight) return totalHeight
  let best = hardEnd
  for (const y of breaks) {
    if (y <= start + 8) continue
    if (y <= hardEnd) best = y
    else break
  }
  if (totalHeight - best < 40) return totalHeight
  return best > start ? best : hardEnd
}

function triggerDownload(bytes: Uint8Array, filename: string) {
  const blob = new Blob([new Uint8Array(bytes)], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 2000)
}

/** Capture the on-screen journey preview and download it as a PDF file. */
export async function downloadJourneyPdf(node: HTMLElement, title = 'LankaLux Itinerary') {
  const host = document.createElement('div')
  host.setAttribute('aria-hidden', 'true')
  host.style.cssText =
    'position:fixed;left:-12000px;top:0;width:760px;background:#f9f4eb;padding:0;margin:0;z-index:-1;pointer-events:none;'

  const clone = node.cloneNode(true) as HTMLElement
  clone.style.minHeight = '0'
  clone.style.background = IVORY
  absolutizeUrls(clone, window.location.href)
  host.appendChild(clone)
  document.body.appendChild(host)

  try {
    await waitForImages(clone)
    await new Promise((r) => setTimeout(r, 200))

    const canvas = await html2canvas(clone, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: IVORY,
      logging: false,
      imageTimeout: 15000,
      width: clone.scrollWidth,
      height: clone.scrollHeight,
      windowWidth: clone.scrollWidth,
      windowHeight: clone.scrollHeight,
    })

    if (!canvas.width || !canvas.height) {
      throw new Error('Could not render itinerary for PDF.')
    }

    const contentWidth = A4_WIDTH_PT - MARGIN_PT * 2
    const contentHeight = A4_HEIGHT_PT - MARGIN_PT * 2
    const pxPerPt = canvas.width / contentWidth
    const pageSlicePx = Math.floor(contentHeight * pxPerPt)
    const breaks = collectBreakYs(clone, canvas.width / Math.max(clone.scrollWidth, 1))

    const pdf = await PDFDocument.create()
    let y = 0
    while (y < canvas.height - 1) {
      const end = nextSliceEnd(y, y + pageSlicePx, breaks, canvas.height)
      const sliceH = Math.max(1, end - y)

      const slice = document.createElement('canvas')
      slice.width = canvas.width
      slice.height = sliceH
      const ctx = slice.getContext('2d')
      if (!ctx) throw new Error('Could not prepare PDF canvas.')
      ctx.fillStyle = IVORY
      ctx.fillRect(0, 0, slice.width, slice.height)
      ctx.drawImage(canvas, 0, y, canvas.width, sliceH, 0, 0, canvas.width, sliceH)

      const dataUrl = slice.toDataURL('image/jpeg', 0.92)
      const base64 = dataUrl.split(',', 2)[1]
      if (!base64) throw new Error('Could not encode PDF page.')
      const binary = atob(base64)
      const jpgBytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i += 1) jpgBytes[i] = binary.charCodeAt(i)
      const jpg = await pdf.embedJpg(jpgBytes)
      const page = pdf.addPage([A4_WIDTH_PT, A4_HEIGHT_PT])
      const drawH = sliceH / pxPerPt
      page.drawRectangle({
        x: 0,
        y: 0,
        width: A4_WIDTH_PT,
        height: A4_HEIGHT_PT,
        color: IVORY_RGB,
      })
      page.drawImage(jpg, {
        x: MARGIN_PT,
        y: A4_HEIGHT_PT - MARGIN_PT - drawH,
        width: contentWidth,
        height: drawH,
      })

      y = end
    }

    const bytes = await pdf.save()
    triggerDownload(bytes, slugifyFilename(title))
  } finally {
    host.remove()
  }
}

/** @deprecated use downloadJourneyPdf */
export async function printJourneyPreview(node: HTMLElement, title = 'LankaLux Itinerary') {
  return downloadJourneyPdf(node, title)
}
