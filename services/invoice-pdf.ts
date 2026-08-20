import { readFile } from 'fs/promises'
import path from 'path'
import {
  PDFDocument,
  PDFString,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from 'pdf-lib'
import { BRAND } from '@/config/brand'
import { invoicePreviewModel, formatMoney } from '@/services/invoice.service'

type PreviewModel = ReturnType<typeof invoicePreviewModel>
type RGB = ReturnType<typeof rgb>

const COLORS = {
  ivory: rgb(0xf9 / 255, 0xf4 / 255, 0xeb / 255),
  cream: rgb(0xf1 / 255, 0xe9 / 255, 0xda / 255),
  forest: rgb(0x1a / 255, 0x2a / 255, 0x1d / 255),
  gold: rgb(0xb1 / 255, 0x85 / 255, 0x44 / 255),
  body: rgb(0x25 / 255, 0x25 / 255, 0x23 / 255),
  muted: rgb(0x6b / 255, 0x6b / 255, 0x66 / 255),
  ivoryInk: rgb(0xf9 / 255, 0xf4 / 255, 0xeb / 255),
}

const A4 = { width: 595.28, height: 841.89 }
const MARGIN = 50
const FOOTER = 66
const HEADER = 102
const GUTTER = 28

async function loadLogoBytes(): Promise<Uint8Array | null> {
  try {
    return await readFile(path.join(process.cwd(), 'public/brand/lankalux-logo.png'))
  } catch {
    try {
      const res = await fetch('https://lankalux.com/lankalux-logo.png', { cache: 'no-store' })
      if (!res.ok) return null
      return new Uint8Array(await res.arrayBuffer())
    } catch {
      return null
    }
  }
}

function wrapLines(text: string, font: PDFFont, size: number, width: number): string[] {
  const words = String(text || '')
    .split(/\s+/)
    .filter(Boolean)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const test = current ? `${current} ${word}` : word
    if (font.widthOfTextAtSize(test, size) > width && current) {
      lines.push(current)
      current = word
    } else {
      current = test
    }
  }
  if (current) lines.push(current)
  return lines.length ? lines : ['']
}

function lineStep(size: number) {
  return size * 1.55
}

class PdfWriter {
  doc: PDFDocument
  page: PDFPage
  regular: PDFFont
  bold: PDFFont
  y: number
  contentWidth: number
  logo: PDFImage | null
  invoiceNumber: string
  invoiceDate: string

  constructor(
    doc: PDFDocument,
    page: PDFPage,
    regular: PDFFont,
    bold: PDFFont,
    logo: PDFImage | null,
    invoiceNumber: string,
    invoiceDate: string
  ) {
    this.doc = doc
    this.page = page
    this.regular = regular
    this.bold = bold
    this.logo = logo
    this.invoiceNumber = invoiceNumber
    this.invoiceDate = invoiceDate
    this.y = A4.height - HEADER - 26
    this.contentWidth = A4.width - MARGIN * 2
    this.paintPage(page)
  }

  paintPage(page: PDFPage) {
    page.drawRectangle({ x: 0, y: 0, width: A4.width, height: A4.height, color: COLORS.ivory })
    page.drawRectangle({
      x: 0,
      y: A4.height - HEADER,
      width: A4.width,
      height: HEADER,
      color: COLORS.cream,
    })
    page.drawRectangle({
      x: 0,
      y: A4.height - HEADER - 1.5,
      width: A4.width,
      height: 1.5,
      color: COLORS.gold,
    })

    if (this.logo) {
      const scale = Math.min(210 / this.logo.width, 46 / this.logo.height)
      const logoW = this.logo.width * scale
      const logoH = this.logo.height * scale
      page.drawImage(this.logo, {
        x: MARGIN,
        y: A4.height - HEADER + (HEADER - logoH) / 2,
        width: logoW,
        height: logoH,
      })
    } else {
      page.drawText(BRAND.name, {
        x: MARGIN,
        y: A4.height - HEADER + 42,
        size: 22,
        font: this.bold,
        color: COLORS.forest,
      })
    }

    page.drawText('INVOICE', {
      x: A4.width - MARGIN - this.bold.widthOfTextAtSize('INVOICE', 13),
      y: A4.height - 42,
      size: 13,
      font: this.bold,
      color: COLORS.forest,
    })
    page.drawText(this.invoiceNumber, {
      x: A4.width - MARGIN - this.bold.widthOfTextAtSize(this.invoiceNumber, 12),
      y: A4.height - 60,
      size: 12,
      font: this.bold,
      color: COLORS.forest,
    })
    page.drawText(this.invoiceDate, {
      x: A4.width - MARGIN - this.regular.widthOfTextAtSize(this.invoiceDate, 9.5),
      y: A4.height - 76,
      size: 9.5,
      font: this.regular,
      color: COLORS.muted,
    })

    page.drawRectangle({
      x: 0,
      y: 0,
      width: A4.width,
      height: FOOTER - 8,
      color: COLORS.cream,
    })
    page.drawRectangle({
      x: 0,
      y: FOOTER - 8,
      width: A4.width,
      height: 1.2,
      color: COLORS.gold,
    })
    page.drawText('Thank you for choosing LankaLux.', {
      x: MARGIN,
      y: 36,
      size: 9.5,
      font: this.bold,
      color: COLORS.forest,
    })
    page.drawText('LankaLux  ·  Bespoke Journeys across Sri Lanka', {
      x: MARGIN,
      y: 22,
      size: 8,
      font: this.regular,
      color: COLORS.muted,
    })
  }

  ensure(space: number) {
    if (this.y - space < FOOTER + 12) {
      this.page = this.doc.addPage([A4.width, A4.height])
      this.paintPage(this.page)
      this.y = A4.height - HEADER - 26
    }
  }

  gap(amount = 14) {
    this.y -= amount
  }

  hairline() {
    this.ensure(22)
    this.gap(8)
    this.page.drawLine({
      start: { x: MARGIN, y: this.y },
      end: { x: MARGIN + this.contentWidth, y: this.y },
      thickness: 0.7,
      color: COLORS.gold,
      opacity: 0.5,
    })
    this.gap(14)
  }

  trackedLabel(text: string, x = MARGIN) {
    this.ensure(20)
    const size = 8
    let cursor = x
    const spaced = text.toUpperCase().split('').join(' ')
    this.page.drawText(spaced, {
      x: cursor,
      y: this.y,
      size,
      font: this.bold,
      color: COLORS.gold,
    })
    this.gap(15)
  }

  wrap(
    text: string,
    opts?: { size?: number; font?: PDFFont; color?: RGB; width?: number; x?: number; after?: number }
  ) {
    const size = opts?.size ?? 10.5
    const font = opts?.font ?? this.regular
    const color = opts?.color ?? COLORS.body
    const width = opts?.width ?? this.contentWidth
    const x = opts?.x ?? MARGIN
    const lines = wrapLines(text, font, size, width)
    const step = lineStep(size)
    for (const line of lines) {
      this.ensure(step + 4)
      this.page.drawText(line, { x, y: this.y, size, font, color })
      this.y -= step
    }
    this.gap(opts?.after ?? 3)
    return lines.length
  }

  measure(text: string, opts?: { size?: number; font?: PDFFont; width?: number }) {
    const size = opts?.size ?? 10.5
    const font = opts?.font ?? this.regular
    const width = opts?.width ?? this.contentWidth
    return wrapLines(text, font, size, width).length * lineStep(size) + 3
  }

  moneyRow(label: string, value: string, emphasize = false) {
    const size = emphasize ? 12 : 10.5
    const font = emphasize ? this.bold : this.regular
    const color = COLORS.forest
    this.ensure(size + 16)
    if (emphasize) {
      this.page.drawRectangle({
        x: MARGIN,
        y: this.y - 8,
        width: this.contentWidth,
        height: size + 16,
        color: COLORS.cream,
      })
      this.page.drawRectangle({
        x: MARGIN,
        y: this.y - 8,
        width: 3,
        height: size + 16,
        color: COLORS.gold,
      })
    }
    this.page.drawText(label, { x: MARGIN + (emphasize ? 12 : 0), y: this.y, size, font, color })
    this.page.drawText(value, {
      x: MARGIN + this.contentWidth - font.widthOfTextAtSize(value, size) - (emphasize ? 8 : 0),
      y: this.y,
      size,
      font,
      color,
    })
    this.y -= size + (emphasize ? 18 : 14)
  }

  card(height: number, draw: (top: number) => void) {
    this.ensure(height + 8)
    const top = this.y
    this.page.drawRectangle({
      x: MARGIN,
      y: top - height,
      width: this.contentWidth,
      height,
      color: COLORS.cream,
    })
    this.page.drawRectangle({
      x: MARGIN,
      y: top - height,
      width: 3,
      height,
      color: COLORS.gold,
    })
    draw(top)
    this.y = top - height - 8
  }

  journeyButton(url: string, atY?: number) {
    const label = 'VIEW FULL JOURNEY'
    const size = 11
    const padX = 28
    const btnH = 36
    const textW = this.bold.widthOfTextAtSize(label, size)
    const btnW = Math.min(this.contentWidth - 32, Math.max(220, textW + padX * 2))
    if (atY == null) {
      this.ensure(btnH + 28)
      this.gap(8)
    }
    const x = MARGIN + (this.contentWidth - btnW) / 2
    const y = (atY ?? this.y) - btnH
    this.page.drawRectangle({
      x,
      y,
      width: btnW,
      height: btnH,
      color: COLORS.forest,
      borderColor: COLORS.gold,
      borderWidth: 1.25,
    })
    this.page.drawText(label, {
      x: x + (btnW - textW) / 2,
      y: y + (btnH - size) / 2 + 1,
      size,
      font: this.bold,
      color: COLORS.ivoryInk,
    })
    const annot = this.doc.context.register(
      this.doc.context.obj({
        Type: 'Annot',
        Subtype: 'Link',
        Rect: [x, y, x + btnW, y + btnH],
        Border: [0, 0, 0],
        C: [0.694, 0.522, 0.267],
        A: { Type: 'Action', S: 'URI', URI: PDFString.of(url) },
      })
    )
    this.page.node.addAnnot(annot)
    if (atY == null) this.y = y - 12
    return btnH
  }
}

export async function renderInvoicePdf(model: PreviewModel): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const page = doc.addPage([A4.width, A4.height])
  const regular = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)

  let logo: PDFImage | null = null
  const logoBytes = await loadLogoBytes()
  if (logoBytes) {
    try {
      logo = await doc.embedPng(logoBytes)
    } catch {
      logo = null
    }
  }

  const writer = new PdfWriter(doc, page, regular, bold, logo, model.invoiceNumber, model.formatted.invoiceDate)
  const leftW = writer.contentWidth * 0.52
  const rightX = MARGIN + leftW + GUTTER
  const rightW = writer.contentWidth - leftW - GUTTER

  const party = [
    model.client.adults ? `${model.client.adults} adult${model.client.adults === 1 ? '' : 's'}` : '',
    model.client.children ? `${model.client.children} child${model.client.children === 1 ? '' : 'ren'}` : '',
  ]
    .filter(Boolean)
    .join('  ·  ')

  const colTop = writer.y
  writer.trackedLabel('Billed to')
  writer.wrap(model.client.name, { font: bold, size: 13, color: COLORS.forest, width: leftW, after: 4 })
  if (model.client.country) writer.wrap(model.client.country, { size: 10.5, color: COLORS.muted, width: leftW })
  if (model.client.additionalNames.length) {
    writer.wrap(model.client.additionalNames.join(', '), { size: 10.5, color: COLORS.muted, width: leftW })
  }
  if (party) writer.wrap(party, { size: 10.5, color: COLORS.muted, width: leftW })
  const afterLeft = writer.y

  writer.y = colTop
  writer.trackedLabel('Travel dates', rightX)
  writer.wrap(`${model.formatted.travelStart}  –  ${model.formatted.travelEnd}`, {
    x: rightX,
    width: rightW,
    size: 12,
    font: bold,
    color: COLORS.forest,
    after: 4,
  })
  if (model.journey.days) {
    writer.wrap(`${model.journey.days} Days  /  ${model.journey.nights} Nights`, {
      x: rightX,
      width: rightW,
      size: 10.5,
      color: COLORS.muted,
    })
  }
  writer.y = Math.min(afterLeft, writer.y)
  writer.hairline()

  const journeyBits = [
    `${model.formatted.travelStart}  –  ${model.formatted.travelEnd}`,
    model.journey.days ? `${model.journey.days} Days  /  ${model.journey.nights} Nights` : '',
    model.journey.destinations.join('  ·  '),
    model.journey.summary,
  ].filter(Boolean)
  const hasJourneyLink = Boolean(model.journey.secureLink)
  const journeyInner =
    18 +
    15 +
    writer.measure(model.journey.title, { size: 14, font: bold, width: writer.contentWidth - 28 }) +
    journeyBits.reduce((sum, line) => sum + writer.measure(line, { size: 10.5, width: writer.contentWidth - 28 }), 0) +
    (hasJourneyLink ? 58 : 24)
  writer.card(journeyInner, (top) => {
    let y = top - 16
    const drawAt = (text: string, opts: { size: number; font?: PDFFont; color: RGB; after?: number }) => {
      const font = opts.font ?? regular
      const lines = wrapLines(text, font, opts.size, writer.contentWidth - 28)
      for (const line of lines) {
        writer.page.drawText(line, { x: MARGIN + 16, y, size: opts.size, font, color: opts.color })
        y -= lineStep(opts.size)
      }
      y -= opts.after ?? 3
    }
    writer.page.drawText('Y O U R   J O U R N E Y', {
      x: MARGIN + 16,
      y,
      size: 8,
      font: bold,
      color: COLORS.gold,
    })
    y -= 16
    drawAt(model.journey.title, { size: 14, font: bold, color: COLORS.forest, after: 6 })
    drawAt(`${model.formatted.travelStart}  –  ${model.formatted.travelEnd}`, { size: 10.5, color: COLORS.muted })
    if (model.journey.days) {
      drawAt(`${model.journey.days} Days  /  ${model.journey.nights} Nights`, { size: 10.5, color: COLORS.muted })
    }
    if (model.journey.destinations.length) {
      drawAt(model.journey.destinations.join('  ·  '), { size: 10.5, color: COLORS.body, after: 4 })
    }
    if (model.journey.summary) {
      drawAt(model.journey.summary, { size: 10.5, color: COLORS.muted, after: 10 })
    }
    if (model.journey.secureLink) {
      writer.journeyButton(model.journey.secureLink, y)
    }
  })
  writer.gap(10)

  const vehicleTop = writer.y
  writer.trackedLabel('Your vehicle')
  writer.wrap(model.vehicle.name || 'To be confirmed', {
    font: bold,
    size: 12,
    color: COLORS.forest,
    width: leftW,
    after: 4,
  })
  if (model.vehicle.category && model.vehicle.category !== model.vehicle.name) {
    writer.wrap(model.vehicle.category, { size: 10, color: COLORS.muted, width: leftW })
  }
  if (model.vehicle.description) {
    writer.wrap(model.vehicle.description, { size: 10, color: COLORS.muted, width: leftW })
  }
  if (model.vehicle.passengerCapacity) {
    writer.wrap(`${model.vehicle.passengerCapacity} passengers`, { size: 10, color: COLORS.muted, width: leftW })
  }
  if (model.vehicle.registrationNumber) {
    writer.wrap(model.vehicle.registrationNumber, { size: 10, color: COLORS.muted, width: leftW })
  }
  const afterVehicle = writer.y

  writer.y = vehicleTop
  writer.trackedLabel('Your Chauffeur-Guide', rightX)
  writer.wrap(model.chauffeurGuide.name || 'To be confirmed', {
    x: rightX,
    width: rightW,
    font: bold,
    size: 12,
    color: COLORS.forest,
    after: 4,
  })
  writer.wrap(model.chauffeurGuide.role || 'LankaLux Chauffeur-Guide', {
    x: rightX,
    width: rightW,
    size: 10,
    color: COLORS.muted,
  })
  if (model.chauffeurGuide.languages.length) {
    writer.wrap(model.chauffeurGuide.languages.join(', '), {
      x: rightX,
      width: rightW,
      size: 10,
      color: COLORS.muted,
    })
  }
  writer.y = Math.min(afterVehicle, writer.y)
  writer.hairline()

  writer.trackedLabel('Package')
  writer.moneyRow(model.packageDescription, formatMoney(model.packageTotal, model.currency))
  writer.gap(10)
  writer.trackedLabel('Payments received')
  if (model.payments.length) {
    for (const payment of model.payments) {
      const left = `${payment.date}  —  ${payment.method}${payment.reference ? `  ·  ${payment.reference}` : ''}`
      const amountText = formatMoney(payment.amount, payment.currency)
      writer.ensure(20)
      const before = writer.y
      writer.wrap(left, { size: 10, color: COLORS.muted, width: writer.contentWidth * 0.68, after: 8 })
      writer.page.drawText(amountText, {
        x: MARGIN + writer.contentWidth - regular.widthOfTextAtSize(amountText, 10.5),
        y: before,
        size: 10.5,
        font: regular,
        color: COLORS.body,
      })
    }
  } else {
    writer.wrap('No payments recorded yet.', { size: 10.5, color: COLORS.muted, after: 8 })
  }
  writer.gap(4)
  writer.moneyRow('Total paid', formatMoney(model.totalPaid, model.currency))
  writer.gap(4)
  writer.moneyRow('Balance due', formatMoney(model.balanceDue, model.currency), true)
  writer.gap(6)
  writer.wrap(`Payment due: ${model.formatted.dueDate}`, { size: 10, color: COLORS.muted, after: 4 })
  writer.hairline()

  writer.trackedLabel('Included')
  for (const item of model.included) {
    writer.ensure(18)
    writer.page.drawCircle({
      x: MARGIN + 3,
      y: writer.y + 3,
      size: 2.2,
      color: COLORS.gold,
    })
    writer.wrap(item, { x: MARGIN + 14, width: writer.contentWidth - 14, size: 10.5, color: COLORS.muted, after: 7 })
  }

  const instructions = model.paymentInstructions
  const instructionLines = [
    instructions.beneficiaryName ? `Beneficiary: ${instructions.beneficiaryName}` : '',
    instructions.bankName ? `Bank: ${instructions.bankName}` : '',
    instructions.accountNumber ? `Account: ${instructions.accountNumber}` : '',
    instructions.branchName ? `Branch: ${instructions.branchName}` : '',
    instructions.swiftCode ? `SWIFT: ${instructions.swiftCode}` : '',
    instructions.iban ? `IBAN: ${instructions.iban}` : '',
    instructions.paymentReferenceNote || '',
    instructions.instructionsNote || '',
  ].filter(Boolean)
  if (instructionLines.length) {
    writer.gap(6)
    const inner =
      18 +
      16 +
      instructionLines.reduce((sum, line) => sum + writer.measure(line, { size: 10.5, width: writer.contentWidth - 28 }), 0) +
      20
    writer.card(inner, (top) => {
      let y = top - 16
      writer.page.drawText('P A Y M E N T   I N S T R U C T I O N S', {
        x: MARGIN + 16,
        y,
        size: 8,
        font: bold,
        color: COLORS.gold,
      })
      y -= 18
      for (const line of instructionLines) {
        const lines = wrapLines(line, regular, 10.5, writer.contentWidth - 28)
        for (const wrapped of lines) {
          writer.page.drawText(wrapped, { x: MARGIN + 16, y, size: 10.5, font: regular, color: COLORS.muted })
          y -= lineStep(10.5)
        }
        y -= 3
      }
    })
  }

  if (model.clientNote) {
    writer.gap(10)
    writer.wrap(model.clientNote, { size: 10.5, color: COLORS.muted, after: 8 })
  }

  return doc.save()
}
