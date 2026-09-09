'use client'

function waitForImages(doc: Document, timeoutMs = 12000): Promise<void> {
  const images = Array.from(doc.images)
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
    Promise.resolve().then(() => {
      if (remaining <= 0) {
        window.clearTimeout(timer)
        resolve()
      }
    })
  })
}

function absolutizeUrls(root: HTMLElement, base: string) {
  root.querySelectorAll('img').forEach((img) => {
    const src = img.getAttribute('src')
    if (!src) return
    try {
      img.setAttribute('src', new URL(src, base).href)
    } catch {
      /* keep original */
    }
  })
}

/** Opens a print window that matches the on-screen journey preview, then Save as PDF. */
export async function printJourneyPreview(node: HTMLElement, title = 'LankaLux Itinerary') {
  const win = window.open('', '_blank', 'noopener,noreferrer,width=920,height=1200')
  if (!win) {
    throw new Error('Pop-up blocked. Allow pop-ups for this site to save the PDF.')
  }

  const stylesheetLinks = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
    .map((el) => (el as HTMLLinkElement).href)
    .filter(Boolean)
  const inlineCss = Array.from(document.querySelectorAll('style'))
    .map((el) => el.textContent || '')
    .join('\n')

  const clone = node.cloneNode(true) as HTMLElement
  absolutizeUrls(clone, window.location.href)

  const safeTitle = title.replace(/[<>&"]/g, '')
  win.document.open()
  win.document.write(`<!DOCTYPE html>
<html data-ll-brand="1" data-theme="light">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${safeTitle}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700&family=Open+Sans:ital,wght@0,400;0,500;0,600;1,400&display=swap" rel="stylesheet" />
${stylesheetLinks.map((href) => `<link rel="stylesheet" href="${href}" />`).join('\n')}
<style>
${inlineCss}
html, body {
  margin: 0;
  background: #f9f4eb !important;
  -webkit-print-color-adjust: exact !important;
  print-color-adjust: exact !important;
  color-adjust: exact !important;
}
.journey-root {
  --ll-font-display: "Be Vietnam Pro", sans-serif;
  --ll-font-body: "Open Sans", sans-serif;
  --font-display: "Be Vietnam Pro", sans-serif;
  --font-body: "Open Sans", sans-serif;
  min-height: 0 !important;
}
.no-print { display: none !important; }
</style>
</head>
<body>
${clone.outerHTML}
</body>
</html>`)
  win.document.close()

  await waitForImages(win.document)
  // Give layout / fonts a beat after images
  await new Promise((r) => setTimeout(r, 250))
  win.focus()
  win.print()
}
