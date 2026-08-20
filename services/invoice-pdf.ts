import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import { invoicePreviewModel, formatMoney } from '@/services/invoice.service'

type PreviewModel = ReturnType<typeof invoicePreviewModel>

const COLORS = {
  ivory: rgb(0xf9 / 255, 0xf4 / 255, 0xeb / 255),
  forest: rgb(0x1a / 255, 0x2a / 255, 0x1d / 255),
  gold: rgb(0xb1 / 255, 0x85 / 255, 0x44 / 255),
  body: rgb(0x25 / 255, 0x25 / 255, 0x23 / 255),
  muted: rgb(0x6b / 255, 0x6b / 255, 0x66 / 255),
  line: rgb(0xd9 / 255, 0xd2 / 255, 0xc5 / 255),
}

function drawRule(page: PDFPage, y: number, width: number, margin: number) {
  page.drawLine({
    start: { x: margin, y },
    end: { x: margin + width, y },
    thickness: 1,
    color: COLORS.line,
  })
}

function drawWrappedText(opts: {
  page: PDFPage
  font: PDFFont
  boldFont?: PDFFont
  text: string
  x: number
  y: number
  width: number
  size: number
  color?: ReturnType<typeof rgb>
  lineGap?: number
}) {
  const { page, font, text, x, width, size } = opts
  const color = opts.color || COLORS.body
  const lineGap = opts.lineGap ?? 1.35

  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const test = current ? `${current} ${word}` : word
    const testWidth = font.widthOfTextAtSize(test, size)
    if (testWidth > width && current) {
      lines.push(current)
      current = word
    } else {
      current = test
    }
  }
  if (current) lines.push(current)

  let cursorY = opts.y
  for (const line of lines) {
    page.drawText(line, {
      x,
      y: cursorY,
      size,
      font,
      color,
    })
    cursorY -= size * lineGap
  }
  return cursorY
}

async function fetchLogoBytes(): Promise<Uint8Array | null> {
  try {
    const res = await fetch('https://lankalux.com/lankalux-logo.png', { cache: 'no-store' })
    if (!res.ok) return null
    const buf = await res.arrayBuffer()
    return new Uint8Array(buf)
  } catch {
    return null
  }
}

export async function renderInvoicePdf(model: PreviewModel): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const page = doc.addPage([595.28, 841.89]) // A4 portrait
  const width = page.getWidth()
  const height = page.getHeight()
  const margin = 44
  const contentWidth = width - margin * 2
  let y = height - 48

  page.drawRectangle({
    x: 0,
    y: 0,
    width,
    height,
    color: COLORS.ivory,
  })

  const regular = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)

  const logoBytes = await fetchLogoBytes()
  if (logoBytes) {
    try {
      const logo = await doc.embedPng(logoBytes)
      const scale = Math.min(180 / logo.width, 38 / logo.height)
      const logoW = logo.width * scale
      const logoH = logo.height * scale
      page.drawImage(logo, {
        x: margin,
        y: y - logoH,
        width: logoW,
        height: logoH,
      })
    } catch {
      page.drawText('LankaLux', { x: margin, y: y - 20, size: 24, font: bold, color: COLORS.forest })
    }
  } else {
    page.drawText('LankaLux', { x: margin, y: y - 20, size: 24, font: bold, color: COLORS.forest })
  }

  page.drawText('INVOICE', {
    x: width - margin - bold.widthOfTextAtSize('INVOICE', 18),
    y: y - 8,
    size: 18,
    font: bold,
    color: COLORS.forest,
  })
  y -= 34
  page.drawText(model.invoiceNumber, {
    x: width - margin - regular.widthOfTextAtSize(model.invoiceNumber, 11),
    y,
    size: 11,
    font: regular,
    color: COLORS.muted,
  })
  y -= 16
  page.drawText(model.formatted.invoiceDate, {
    x: width - margin - regular.widthOfTextAtSize(model.formatted.invoiceDate, 11),
    y,
    size: 11,
    font: regular,
    color: COLORS.muted,
  })

  y -= 20
  drawRule(page, y, contentWidth, margin)
  y -= 24

  page.drawText('BILLED TO', { x: margin, y, size: 9, font: bold, color: COLORS.gold })
  y -= 15
  page.drawText(model.client.name, { x: margin, y, size: 12, font: bold, color: COLORS.forest })
  y -= 14
  if (model.client.country) {
    page.drawText(model.client.country, { x: margin, y, size: 10, font: regular, color: COLORS.muted })
    y -= 13
  }

  const rightLabelX = margin + contentWidth * 0.58
  let rightY = y + (model.client.country ? 27 : 14)
  page.drawText('TRAVEL DATES', { x: rightLabelX, y: rightY, size: 9, font: bold, color: COLORS.gold })
  rightY -= 15
  const travelDates = `${model.formatted.travelStart} - ${model.formatted.travelEnd}`
  page.drawText(travelDates, { x: rightLabelX, y: rightY, size: 11, font: regular, color: COLORS.forest })

  y -= 18
  drawRule(page, y, contentWidth, margin)
  y -= 22

  page.drawText('YOUR JOURNEY', { x: margin, y, size: 9, font: bold, color: COLORS.gold })
  y -= 15
  page.drawText(model.journey.title, { x: margin, y, size: 14, font: bold, color: COLORS.forest })
  y -= 16
  page.drawText(`${model.journey.days} Days / ${model.journey.nights} Nights`, {
    x: margin,
    y,
    size: 10,
    font: regular,
    color: COLORS.muted,
  })
  y -= 14
  if (model.journey.destinations.length) {
    const route = model.journey.destinations.join(' · ')
    y = drawWrappedText({
      page,
      font: regular,
      text: route,
      x: margin,
      y,
      width: contentWidth,
      size: 10,
      color: COLORS.body,
    })
  }
  y -= 4
  if (model.journey.summary) {
    y = drawWrappedText({
      page,
      font: regular,
      text: model.journey.summary,
      x: margin,
      y,
      width: contentWidth,
      size: 10,
      color: COLORS.muted,
    })
  }

  y -= 8
  drawRule(page, y, contentWidth, margin)
  y -= 20

  page.drawText('YOUR VEHICLE', { x: margin, y, size: 9, font: bold, color: COLORS.gold })
  y -= 14
  page.drawText(model.vehicle.name || 'Not specified', { x: margin, y, size: 11, font: bold, color: COLORS.forest })
  y -= 13
  if (model.vehicle.description) {
    y = drawWrappedText({
      page,
      font: regular,
      text: model.vehicle.description,
      x: margin,
      y,
      width: contentWidth * 0.5,
      size: 9.5,
      color: COLORS.muted,
    })
  }

  let rightSectionY = y + 25
  page.drawText('YOUR CHAUFFEUR-GUIDE', { x: rightLabelX, y: rightSectionY, size: 9, font: bold, color: COLORS.gold })
  rightSectionY -= 14
  page.drawText(model.chauffeurGuide.name || 'To be confirmed', {
    x: rightLabelX,
    y: rightSectionY,
    size: 11,
    font: bold,
    color: COLORS.forest,
  })
  rightSectionY -= 13
  page.drawText(model.chauffeurGuide.role || 'LankaLux Chauffeur-Guide', {
    x: rightLabelX,
    y: rightSectionY,
    size: 9.5,
    font: regular,
    color: COLORS.muted,
  })

  y -= 14
  drawRule(page, y, contentWidth, margin)
  y -= 20

  page.drawText('PACKAGE', { x: margin, y, size: 9, font: bold, color: COLORS.gold })
  y -= 16
  page.drawText(model.packageDescription, { x: margin, y, size: 11, font: regular, color: COLORS.body })
  page.drawText(formatMoney(model.packageTotal, model.currency), {
    x: width - margin - bold.widthOfTextAtSize(formatMoney(model.packageTotal, model.currency), 11),
    y,
    size: 11,
    font: bold,
    color: COLORS.forest,
  })
  y -= 22

  page.drawText('PAYMENTS RECEIVED', { x: margin, y, size: 9, font: bold, color: COLORS.gold })
  y -= 14
  if (model.payments.length) {
    for (const payment of model.payments) {
      const left = `${payment.date} - ${payment.method}${payment.reference ? ` (${payment.reference})` : ''}`
      y = drawWrappedText({
        page,
        font: regular,
        text: left,
        x: margin,
        y,
        width: contentWidth * 0.72,
        size: 9.5,
        color: COLORS.muted,
      })
      const amountText = formatMoney(payment.amount, payment.currency)
      page.drawText(amountText, {
        x: width - margin - regular.widthOfTextAtSize(amountText, 9.5),
        y: y + 12,
        size: 9.5,
        font: regular,
        color: COLORS.body,
      })
      y -= 4
    }
  } else {
    page.drawText('No payments recorded yet.', { x: margin, y, size: 9.5, font: regular, color: COLORS.muted })
    y -= 14
  }

  y -= 8
  page.drawText('TOTAL PAID', { x: margin, y, size: 10, font: bold, color: COLORS.forest })
  const totalPaidLabel = formatMoney(model.totalPaid, model.currency)
  page.drawText(totalPaidLabel, {
    x: width - margin - bold.widthOfTextAtSize(totalPaidLabel, 10),
    y,
    size: 10,
    font: bold,
    color: COLORS.forest,
  })
  y -= 14
  page.drawText('BALANCE DUE', { x: margin, y, size: 10, font: bold, color: COLORS.forest })
  const balanceLabel = formatMoney(model.balanceDue, model.currency)
  page.drawText(balanceLabel, {
    x: width - margin - bold.widthOfTextAtSize(balanceLabel, 10),
    y,
    size: 10,
    font: bold,
    color: COLORS.forest,
  })
  y -= 15
  page.drawText(`Payment due: ${model.formatted.dueDate}`, { x: margin, y, size: 9.5, font: regular, color: COLORS.muted })

  y -= 16
  drawRule(page, y, contentWidth, margin)
  y -= 18

  page.drawText('INCLUDED', { x: margin, y, size: 9, font: bold, color: COLORS.gold })
  y -= 13
  for (const item of model.included.slice(0, 4)) {
    page.drawText('•', { x: margin, y, size: 12, font: bold, color: COLORS.gold })
    y = drawWrappedText({
      page,
      font: regular,
      text: item,
      x: margin + 12,
      y,
      width: contentWidth - 12,
      size: 9.3,
      color: COLORS.muted,
    })
    y -= 2
  }

  y -= 6
  if (model.journey.secureLink) {
    page.drawText('View your complete LankaLux journey:', { x: margin, y, size: 9.5, font: bold, color: COLORS.forest })
    y -= 12
    y = drawWrappedText({
      page,
      font: regular,
      text: model.journey.secureLink,
      x: margin,
      y,
      width: contentWidth,
      size: 9,
      color: COLORS.gold,
    })
  }

  if (model.clientNote) {
    y -= 10
    y = drawWrappedText({
      page,
      font: regular,
      text: model.clientNote,
      x: margin,
      y,
      width: contentWidth,
      size: 9.5,
      color: COLORS.muted,
    })
  }

  page.drawText('Thank you for choosing LankaLux.', { x: margin, y: 56, size: 10, font: regular, color: COLORS.forest })
  page.drawText('LankaLux · Bespoke Journeys across Sri Lanka', {
    x: margin,
    y: 42,
    size: 8.5,
    font: regular,
    color: COLORS.muted,
  })

  return doc.save()
}
