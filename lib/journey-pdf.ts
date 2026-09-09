'use client'

/** Capture the actual preview at its current width, not a separate PDF template. */
export async function downloadJourneyPdf(root: HTMLElement, filename: string) {
  const [{ toCanvas, getFontEmbedCSS }, { PDFDocument, rgb }] = await Promise.all([
    import('html-to-image'), import('pdf-lib'),
  ])
  await document.fonts.ready
  const images = Array.from(root.querySelectorAll('img'))
  await Promise.all(images.map(async (img) => {
    await Promise.race([
      img.decode(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('An itinerary photo is still loading. Please try again.')), 15000)),
    ])
    if (!img.naturalWidth) throw new Error('An itinerary photo could not load. Please try again.')
  }))

  const bounds = root.getBoundingClientRect()
  const width = Math.ceil(bounds.width)
  const height = Math.ceil(root.scrollHeight)
  if (!width || !height) throw new Error('Open the itinerary preview before downloading.')
  const pageWidth = 595.28
  const pageHeight = 841.89
  const maxSlice = Math.floor(width * pageHeight / pageWidth)
  // Avoid cutting photographs or individual text lines across pages.
  const protectedRanges: Array<{ top: number; bottom: number }> = []
  root.querySelectorAll('img').forEach(el => {
    const r = el.getBoundingClientRect()
    protectedRanges.push({ top: r.top - bounds.top, bottom: r.bottom - bounds.top })
  })
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  while (walker.nextNode()) {
    if (!walker.currentNode.textContent?.trim()) continue
    const range = document.createRange()
    range.selectNodeContents(walker.currentNode)
    for (const r of Array.from(range.getClientRects())) {
      protectedRanges.push({ top: r.top - bounds.top - 1, bottom: r.bottom - bounds.top + 1 })
    }
  }

  const wrapper = document.createElement('div')
  wrapper.setAttribute('aria-hidden', 'true')
  wrapper.style.cssText = `position:fixed;left:-100000px;top:0;width:${width}px;overflow:hidden;pointer-events:none;background:#f9f4eb;`
  const clone = root.cloneNode(true) as HTMLElement
  // Freeze inherited font variables and root styles from the visible preview.
  const computed = getComputedStyle(root)
  for (const property of Array.from(computed)) clone.style.setProperty(property, computed.getPropertyValue(property))
  clone.style.width = `${width}px`
  clone.style.height = `${height}px`
  clone.style.minHeight = '0'
  clone.style.margin = '0'
  clone.style.position = 'relative'
  wrapper.appendChild(clone)
  root.parentElement!.appendChild(wrapper)
  try {
    // Embed photos explicitly: fail visibly rather than silently exporting blank images.
    const cache = new Map<string, Promise<string>>()
    const clonedImages = Array.from(clone.querySelectorAll('img'))
    await Promise.all(images.map(async (img, index) => {
      const src = img.currentSrc || img.src
      if (!cache.has(src)) cache.set(src, (async () => {
        const response = await fetch(src)
        if (!response.ok) throw new Error('A photo could not be included in the PDF. Please try again.')
        const blob = await response.blob()
        return new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(String(reader.result))
          reader.onerror = () => reject(new Error('Could not prepare an itinerary photo.'))
          reader.readAsDataURL(blob)
        })
      })())
      clonedImages[index].removeAttribute('srcset')
      clonedImages[index].src = await cache.get(src)!
      await clonedImages[index].decode()
    }))
    const fontEmbedCSS = await getFontEmbedCSS(root)
    const pdf = await PDFDocument.create()
    pdf.setTitle(filename)
    pdf.setCreator('LankaLux')
    for (let top = 0; top < height;) {
      let bottom = Math.min(height, top + maxSlice)
      if (bottom < height) {
        // Move backwards out of overlapping image/text ranges until the break is safe.
        for (let attempt = 0; attempt < protectedRanges.length; attempt++) {
          const crossing = protectedRanges.filter(r => r.top < bottom && r.bottom > bottom && r.top > top)
          if (!crossing.length) break
          const next = Math.floor(Math.min(...crossing.map(r => r.top)))
          if (next <= top || next === bottom) break
          bottom = next
        }
      }
      const sliceHeight = bottom - top
      wrapper.style.height = `${sliceHeight}px`
      clone.style.top = `-${top}px`
      const canvas = await toCanvas(wrapper, {
        width, height: sliceHeight, pixelRatio: 2, fontEmbedCSS,
        backgroundColor: '#f9f4eb', style: { left: '0px', top: '0px' },
      })
      const png = await pdf.embedPng(canvas.toDataURL('image/png'))
      const page = pdf.addPage([pageWidth, pageHeight])
      page.drawRectangle({ x: 0, y: 0, width: pageWidth, height: pageHeight, color: rgb(249 / 255, 244 / 255, 235 / 255) })
      const drawnHeight = sliceHeight * pageWidth / width
      page.drawImage(png, { x: 0, y: pageHeight - drawnHeight, width: pageWidth, height: drawnHeight })
      canvas.width = 0
      canvas.height = 0
      top = bottom
    }
    const bytes = await pdf.save()
    const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `${filename.replace(/[^a-zA-Z0-9 _-]/g, '').trim().slice(0, 100) || 'LankaLux-itinerary'}.pdf`
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 60000)
  } finally {
    wrapper.remove()
  }
}
