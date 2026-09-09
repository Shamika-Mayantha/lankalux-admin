'use client'

import html2canvas from 'html2canvas'
import { PDFDocument, rgb } from 'pdf-lib'

const IVORY = '#f9f4eb'
const IVORY_RGB = rgb(249 / 255, 244 / 255, 235 / 255)
const A4_WIDTH_PT = 595.28
const A4_HEIGHT_PT = 841.89
const MARGIN_PT = 24
const MIN_PAGE_CONTENT_PX = 64

type Range = { top: number; bottom: number }

function waitForImages(root: ParentNode, timeoutMs = 15000): Promise<void> {
  const images = Array.from(root.querySelectorAll('img'))
  if (!images.length) return Promise.resolve()
  return new Promise((resolve) => {
    let remaining = images.length
    const done = () => {
      remaining -= 1
      if (remaining <= 0) resolve()
    }
    window.setTimeout(resolve, timeoutMs)
    images.forEach((img) => {
      if (img.complete && img.naturalWidth > 0) {
        done()
        return
      }
      img.addEventListener('load', done, { once: true })
      img.addEventListener('error', done, { once: true })
    })
    if (remaining <= 0) resolve()
  })
}

function absolutizeUrls(root: HTMLElement, base: string) {
  root.querySelectorAll('img').forEach((img) => {
    const src = img.getAttribute('src')
    if (!src) return
    try {
      img.setAttribute('src', new URL(src, base).href)
      img.crossOrigin = 'anonymous'
    } catch {
      /* keep original */
    }
  })
}

/**
 * html2canvas often stretches CSS object-fit images.
 * Bake object-fit:cover into a plain bitmap at the element's display size.
 */
function bakeObjectFitImages(root: HTMLElement) {
  root.querySelectorAll('img').forEach((imgEl) => {
    const img = imgEl as HTMLImageElement
    const style = window.getComputedStyle(img)
    const fit = style.objectFit
    if (fit !== 'cover' && fit !== 'contain') return
    if (!img.naturalWidth || !img.naturalHeight) return

    const w = Math.max(1, Math.round(img.getBoundingClientRect().width))
    const h = Math.max(1, Math.round(img.getBoundingClientRect().height))
    if (w < 2 || h < 2) return

    const canvas = document.createElement('canvas')
    const ratio = Math.min(2, window.devicePixelRatio || 2)
    canvas.width = Math.round(w * ratio)
    canvas.height = Math.round(h * ratio)
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const scale =
      fit === 'cover'
        ? Math.max(w / img.naturalWidth, h / img.naturalHeight)
        : Math.min(w / img.naturalWidth, h / img.naturalHeight)
    const dw = img.naturalWidth * scale
    const dh = img.naturalHeight * scale
    const dx = (w - dw) / 2
    const dy = (h - dh) / 2
    try {
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
      ctx.fillStyle = IVORY
      ctx.fillRect(0, 0, w, h)
      ctx.drawImage(img, dx, dy, dw, dh)

      const baked = document.createElement('img')
      baked.src = canvas.toDataURL('image/jpeg', 0.93)
      baked.alt = img.alt || ''
      baked.className = img.className
      baked.style.width = `${w}px`
      baked.style.height = `${h}px`
      baked.style.maxHeight = 'none'
      baked.style.objectFit = 'fill'
      baked.style.display = 'block'
      img.replaceWith(baked)
    } catch {
      /* Cross-origin image — leave original and let html2canvas best-effort */
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

function layoutMetrics(root: HTMLElement, scale: number): { breaks: number[]; blocked: Range[] } {
  const rootRect = root.getBoundingClientRect()
  const yAt = (el: Element, edge: 'top' | 'bottom') => {
    const r = el.getBoundingClientRect()
    const y = edge === 'top' ? r.top : r.bottom
    return Math.max(0, Math.round((y - rootRect.top) * scale))
  }

  const breaks = new Set<number>([0])
  const blocked: Range[] = []

  root.querySelectorAll('.journey-photo-wrap, .journey-logo, .journey-v-photos').forEach((el) => {
    const top = yAt(el, 'top')
    const bottom = yAt(el, 'bottom')
    if (bottom > top) {
      blocked.push({ top, bottom })
      breaks.add(top)
      breaks.add(bottom)
    }
  })

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
    if (zone.top < next && zone.bottom > next) {
      if (zone.top > start + MIN_PAGE_CONTENT_PX) next = zone.top
      else next = Math.max(next, zone.bottom)
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

  for (const zone of blocked) {
    if (zone.top >= start && zone.top < hardEnd && zone.bottom > maxEnd) {
      if (zone.top > start + MIN_PAGE_CONTENT_PX) hardEnd = zone.top
    }
  }

  hardEnd = avoidBlockedEnd(start, hardEnd, blocked)

  let chosen = hardEnd
  for (const y of breaks) {
    if (y <= start + MIN_PAGE_CONTENT_PX) continue
    if (y <= hardEnd) chosen = y
    else break
  }

  chosen = avoidBlockedEnd(start, chosen, blocked)

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

function setupPreviewClone(node: HTMLElement): HTMLElement {
  const host = document.createElement('div')
  host.setAttribute('aria-hidden', 'true')
  // Match journey preview column width used on screen
  host.style.cssText =
    'position:fixed;left:-12000px;top:0;width:760px;background:#f9f4eb;padding:0;margin:0;z-index:-1;pointer-events:none;'

  const clone = node.cloneNode(true) as HTMLElement
  clone.style.minHeight = '0'
  clone.style.width = '760px'
  clone.style.background = IVORY
  // Keep preview photo sizing (do not force shorter/stretched images)
  clone.querySelectorAll('.journey-photo-wrap').forEach((el) => {
    const wrap = el as HTMLElement
    wrap.style.marginLeft = '0'
    wrap.style.marginRight = '0'
  })
  absolutizeUrls(clone, window.location.href)
  host.appendChild(clone)
  document.body.appendChild(host)
  ;(host as HTMLElement & { __clone?: HTMLElement }).__clone = clone
  return host
}

/** Capture the journey preview exactly as shown and download a PDF. */
export async function downloadJourneyPdf(node: HTMLElement, title = 'LankaLux Itinerary') {
  const host = setupPreviewClone(node)
  const clone = host.querySelector('.journey-root') as HTMLElement | null
  if (!clone) {
    host.remove()
    throw new Error('Preview is not ready yet.')
  }

  try {
    await waitForImages(clone)
    // Layout pass before baking object-fit
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    bakeObjectFitImages(clone)
    await waitForImages(clone)
    await new Promise((r) => setTimeout(r, 150))

    const canvas = await html2canvas(clone, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: IVORY,
      logging: false,
      imageTimeout: 15000,
      // Do not pass custom width/height — that stretches the capture
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

      const dataUrl = slice.toDataURL('image/jpeg', 0.93)
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
      // Always preserve aspect ratio of the captured slice
      const fit = Math.min(1, contentHeight / naturalH)
      const drawW = contentWidth * fit
      const drawH = naturalH * fit
      page.drawImage(jpg, {
        x: MARGIN_PT + (contentWidth - drawW) / 2,
        y: A4_HEIGHT_PT - MARGIN_PT - drawH,
        width: drawW,
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
