'use client'

import html2canvas from 'html2canvas'
import { PDFDocument, rgb } from 'pdf-lib'

const IVORY = '#f9f4eb'
const IVORY_RGB = rgb(249 / 255, 244 / 255, 235 / 255)
const A4_WIDTH_PT = 595.28
const A4_HEIGHT_PT = 841.89
const MARGIN_PT = 28
/** Prefer leaving empty space at the bottom over splitting a photo. */
const MIN_PAGE_CONTENT_PX = 48

type Range = { top: number; bottom: number }

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

/** Keep day photos short enough that they usually fit under a day header on one page. */
function prepareCloneForPdf(root: HTMLElement) {
  root.querySelectorAll('.journey-photo').forEach((el) => {
    const img = el as HTMLElement
    img.style.maxHeight = '200px'
    img.style.width = '100%'
    img.style.objectFit = 'cover'
    img.style.display = 'block'
  })
  root.querySelectorAll('.journey-photo-wrap').forEach((el) => {
    const wrap = el as HTMLElement
    wrap.style.marginLeft = '0'
    wrap.style.marginRight = '0'
    wrap.style.breakInside = 'avoid'
  })
  root.querySelectorAll('.journey-v-photos img').forEach((el) => {
    const img = el as HTMLElement
    img.style.height = '72px'
    img.style.objectFit = 'cover'
  })
  root.querySelectorAll('.journey-logo').forEach((el) => {
    const img = el as HTMLElement
    img.style.maxHeight = '48px'
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

function layoutMetrics(root: HTMLElement, scale: number): { breaks: number[]; blocked: Range[] } {
  const rootRect = root.getBoundingClientRect()
  const yAt = (el: Element, edge: 'top' | 'bottom') => {
    const r = el.getBoundingClientRect()
    const y = edge === 'top' ? r.top : r.bottom
    return Math.max(0, Math.round((y - rootRect.top) * scale))
  }

  const breaks = new Set<number>([0])
  const blocked: Range[] = []

  // Never slice through photos / logo / vehicle thumbnails
  root.querySelectorAll('.journey-photo-wrap, .journey-logo, .journey-v-photos').forEach((el) => {
    const top = yAt(el, 'top')
    const bottom = yAt(el, 'bottom')
    if (bottom > top) {
      blocked.push({ top, bottom })
      breaks.add(top)
      breaks.add(bottom)
    }
  })

  // Prefer starting new pages at these boundaries
  root
    .querySelectorAll(
      '.journey-hero, .journey-day, .journey-footer, .journey-footer section, .journey-hotel, .journey-contact, .journey-desc, .journey-list-title, .journey-acts, .journey-travel'
    )
    .forEach((el) => {
      breaks.add(yAt(el, 'top'))
      breaks.add(yAt(el, 'bottom'))
    })

  return {
    breaks: Array.from(breaks).sort((a, b) => a - b),
    blocked: blocked.sort((a, b) => a.top - b.top),
  }
}

function avoidBlockedEnd(start: number, end: number, blocked: Range[]): number {
  let next = end
  for (const zone of blocked) {
    // Slice would cut through a protected block → end before it when possible
    if (zone.top < next && zone.bottom > next) {
      if (zone.top > start + MIN_PAGE_CONTENT_PX) {
        next = zone.top
      } else {
        // Block already began on this page — keep it whole on this page
        next = Math.max(next, zone.bottom)
      }
    }
  }
  return next
}

function nextSliceEnd(
  start: number,
  maxEnd: number,
  breaks: number[],
  blocked: Range[],
  totalHeight: number
): number {
  if (maxEnd >= totalHeight) return totalHeight

  let hardEnd = avoidBlockedEnd(start, Math.min(maxEnd, totalHeight), blocked)

  // If including a full photo pushed us past a page, still don't cut the photo —
  // but try to start the photo on the next page instead when it hasn't begun yet.
  for (const zone of blocked) {
    if (zone.top >= start && zone.top < hardEnd && zone.bottom > maxEnd) {
      // Photo cannot fit in remaining page budget
      if (zone.top > start + MIN_PAGE_CONTENT_PX) {
        hardEnd = zone.top
      }
    }
  }

  hardEnd = avoidBlockedEnd(start, hardEnd, blocked)

  // Prefer the latest clean break at or before hardEnd
  let chosen = hardEnd
  for (const y of breaks) {
    if (y <= start + MIN_PAGE_CONTENT_PX) continue
    if (y <= hardEnd) chosen = y
    else break
  }

  chosen = avoidBlockedEnd(start, chosen, blocked)

  // Final guard: never return an end that sits inside a photo
  for (const zone of blocked) {
    if (chosen > zone.top && chosen < zone.bottom) {
      chosen = zone.top > start + MIN_PAGE_CONTENT_PX ? zone.top : zone.bottom
    }
  }

  if (totalHeight - chosen < 24) return totalHeight
  return Math.min(Math.max(chosen, start + 1), totalHeight)
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
  prepareCloneForPdf(clone)
  host.appendChild(clone)
  document.body.appendChild(host)

  try {
    await waitForImages(clone)
    await new Promise((r) => setTimeout(r, 250))

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
    const scale = canvas.width / Math.max(clone.scrollWidth, 1)
    const { breaks, blocked } = layoutMetrics(clone, scale)

    const pdf = await PDFDocument.create()
    let y = 0
    let guard = 0
    while (y < canvas.height - 1) {
      guard += 1
      if (guard > 80) throw new Error('PDF pagination failed.')

      const end = nextSliceEnd(y, y + pageSlicePx, breaks, blocked, canvas.height)
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
      page.drawRectangle({
        x: 0,
        y: 0,
        width: A4_WIDTH_PT,
        height: A4_HEIGHT_PT,
        color: IVORY_RGB,
      })

      const naturalH = sliceH / pxPerPt
      if (naturalH <= contentHeight) {
        page.drawImage(jpg, {
          x: MARGIN_PT,
          y: A4_HEIGHT_PT - MARGIN_PT - naturalH,
          width: contentWidth,
          height: naturalH,
        })
      } else {
        // Rare: keep an oversized block whole by scaling the whole page slice down
        const fit = contentHeight / naturalH
        const drawW = contentWidth * fit
        const drawH = contentHeight
        page.drawImage(jpg, {
          x: MARGIN_PT + (contentWidth - drawW) / 2,
          y: A4_HEIGHT_PT - MARGIN_PT - drawH,
          width: drawW,
          height: drawH,
        })
      }

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
