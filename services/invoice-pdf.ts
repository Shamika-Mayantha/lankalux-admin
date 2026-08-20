import { readFile } from 'fs/promises'
import path from 'path'
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib'
import { BRAND } from '@/config/brand'
import { invoicePreviewModel, formatMoney } from '@/services/invoice.service'

type PreviewModel = ReturnType<typeof invoicePreviewModel>

const COLORS = {
  ivory: rgb(0xf9 / 255, 0xf4 / 255, 0xeb / 255),
  forest: rgb(0x1a / 255, 0x2a / 255, 0x1d / 255),
  gold: rgb(0xb1 / 255, 0x85 / 255, 0x44 / 255),
  body: rgb(0x25 / 255, 0x25 / 255, 0x23 / 255),
  muted: rgb(0x6b / 255, 0x6b / 255, 0x66 / 255),
  line: rgb(0x1a / 255, 0x2a / 255, 0x1d / 255),
}

const A4 = { width: 595.28, height: 841.89 }
const MARGIN = 48
const FOOTER = 56

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

class PdfWriter {
  doc: PDFDocument
  page: PDFPage
  regular: PDFFont
  bold: PDFFont
  y: number
  contentWidth: number

  constructor(doc: PDFDocument, page: PDFPage, regular: PDFFont, bold: PDFFont) {
    this.doc = doc
    this.page = page
    this.regular = regular
    this.bold = bold
    this.y = A4.height - 44
    this.contentWidth = A4.width - MARGIN * 2
  }

  paintBackground(page: PDFPage) {
    page.drawRectangle({ x: 0, y: 0, width: A4.width, height: A4.height, color: COLORS.ivory })
  }

  ensure(space: number) {
    if (this.y - space < FOOTER + 18) {
      this.page = this.doc.addPage([A4.width, A4.height])
      this.paintBackground(this.page)
      this.y = A4.height - 44
    }
  }

  rule() {
    this.ensure(16)
    this.page.drawLine({
      start: { x: MARGIN, y: this.y },
      end: { x: MARGIN + this.contentWidth, y: this.y },
      thickness: 0.6,
      color: COLORS.gold,
      opacity: 0.55,
    })
    this.y -= 16
  }

  label(text: string) {
    this.ensure(18)
    this.page.drawText(text.toUpperCase(), {
      x: MARGIN,
      y: this.y,
      size: 8,
      font: this.bold,
      color: COLORS.gold,
    })
    this.y -= 14
  }

  wrap(text: string, opts?: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb>; width?: number; x?: number }) {
    const size = opts?.size ?? 10
    const font = opts?.font ?? this.regular
    const color = opts?.color ?? COLORS.body
    const width = opts?.width ?? this.contentWidth
    const x = opts?.x ?? MARGIN
    const words = String(text || '').split(/\s+/).filter(Boolean)
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
    if (!lines.length) lines.push('')
    for (const line of lines) {
      this.ensure(size + 6)
      this.page.drawText(line, { x, y: this.y, size, font, color })
      this.y -= size * 1.38
    }
    return lines.length
  }

  moneyRow(label: string, value: string, emphasize = false) {
    this.ensure(16)
    const font = emphasize ? this.bold : this.regular
    const color = COLORS.forest
    this.page.drawText(label, { x: MARGIN, y: this.y, size: 10, font, color })
    this.page.drawText(value, {
      x: MARGIN + this.contentWidth - font.widthOfTextAtSize(value, 10),
      y: this.y,
      size: 10,
      font,
      color,
    })
    this.y -= 15
  }
}

export async function renderInvoicePdf(model: PreviewModel): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const page = doc.addPage([A4.width, A4.height])
  const regular = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const writer = new PdfWriter(doc, page, regular, bold)
  writer.paintBackground(page)

  let logo: PDFImage | null = null
  const logoBytes = await loadLogoBytes()
  if (logoBytes) {
    try {
      logo = await doc.embedPng(logoBytes)
    } catch {
      logo = null
    }
  }

  if (logo) {
    const scale = Math.min(196 / logo.width, 42 / logo.height)
    const logoW = logo.width * scale
    const logoH = logo.height * scale
    writer.page.drawImage(logo, { x: MARGIN, y: writer.y - logoH + 8, width: logoW, height: logoH })
  } else {
    writer.page.drawText(BRAND.name, { x: MARGIN, y: writer.y - 8, size: 22, font: bold, color: COLORS.forest })
  }

  writer.page.drawText('INVOICE', {
    x: A4.width - MARGIN - bold.widthOfTextAtSize('INVOICE', 16),
    y: writer.y,
    size: 16,
    font: bold,
    color: COLORS.forest,
  })
  writer.y -= 18
  writer.page.drawText(model.invoiceNumber, {
    x: A4.width - MARGIN - regular.widthOfTextAtSize(model.invoiceNumber, 10),
    y: writer.y,
    size: 10,
    font: regular,
    color: COLORS.muted,
  })
  writer.y -= 13
  writer.page.drawText(model.formatted.invoiceDate, {
    x: A4.width - MARGIN - regular.widthOfTextAtSize(model.formatted.invoiceDate, 10),
    y: writer.y,
    size: 10,
    font: regular,
    color: COLORS.muted,
  })
  writer.y -= 22
  writer.rule()

  const colY = writer.y
  writer.label('Billed to')
  writer.wrap(model.client.name, { font: bold, size: 12, color: COLORS.forest })
  if (model.client.country) writer.wrap(model.client.country, { size: 10, color: COLORS.muted })
  if (model.client.additionalNames.length) {
    writer.wrap(model.client.additionalNames.join(', '), { size: 10, color: COLORS.muted })
  }
  const party = [
    model.client.adults ? `${model.client.adults} adult${model.client.adults === 1 ? '' : 's'}` : '',
    model.client.children ? `${model.client.children} child${model.client.children === 1 ? '' : 'ren'}` : '',
  ]
    .filter(Boolean)
    .join(' · ')
  if (party) writer.wrap(party, { size: 10, color: COLORS.muted })

  const afterLeft = writer.y
  const rightX = MARGIN + writer.contentWidth * 0.58
  writer.y = colY
  writer.page.drawText('TRAVEL DATES', { x: rightX, y: writer.y, size: 8, font: bold, color: COLORS.gold })
  writer.y -= 14
  writer.wrap(`${model.formatted.travelStart} – ${model.formatted.travelEnd}`, {
    x: rightX,
    width: writer.contentWidth * 0.42,
    size: 11,
    color: COLORS.forest,
  })
  writer.y = Math.min(afterLeft, writer.y) - 8
  writer.rule()

  writer.label('Your journey')
  writer.wrap(model.journey.title, { font: bold, size: 13, color: COLORS.forest })
  writer.wrap(`${model.formatted.travelStart} – ${model.formatted.travelEnd}`, { size: 10, color: COLORS.muted })
  if (model.journey.days) {
    writer.wrap(`${model.journey.days} Days / ${model.journey.nights} Nights`, { size: 10, color: COLORS.muted })
  }
  if (model.journey.destinations.length) {
    writer.wrap(model.journey.destinations.join(' · '), { size: 10, color: COLORS.body })
  }
  if (model.journey.summary) {
    writer.wrap(model.journey.summary, { size: 10, color: COLORS.muted })
  }
  writer.y -= 6
  writer.rule()

  const vehicleTop = writer.y
  writer.label('Your vehicle')
  writer.wrap(model.vehicle.name || 'To be confirmed', { font: bold, size: 11, color: COLORS.forest })
  if (model.vehicle.category && model.vehicle.category !== model.vehicle.name) {
    writer.wrap(model.vehicle.category, { size: 9.5, color: COLORS.muted })
  }
  if (model.vehicle.description) {
    writer.wrap(model.vehicle.description, { size: 9.5, color: COLORS.muted, width: writer.contentWidth * 0.5 })
  }
  if (model.vehicle.passengerCapacity) {
    writer.wrap(`${model.vehicle.passengerCapacity} passengers`, { size: 9.5, color: COLORS.muted })
  }
  if (model.vehicle.registrationNumber) {
    writer.wrap(model.vehicle.registrationNumber, { size: 9.5, color: COLORS.muted })
  }
  const afterVehicle = writer.y

  writer.y = vehicleTop
  writer.page.drawText('YOUR CHAUFFEUR-GUIDE', { x: rightX, y: writer.y, size: 8, font: bold, color: COLORS.gold })
  writer.y -= 14
  writer.wrap(model.chauffeurGuide.name || 'To be confirmed', {
    x: rightX,
    width: writer.contentWidth * 0.42,
    font: bold,
    size: 11,
    color: COLORS.forest,
  })
  writer.wrap(model.chauffeurGuide.role || 'LankaLux Chauffeur-Guide', {
    x: rightX,
    width: writer.contentWidth * 0.42,
    size: 9.5,
    color: COLORS.muted,
  })
  if (model.chauffeurGuide.languages.length) {
    writer.wrap(model.chauffeurGuide.languages.join(', '), {
      x: rightX,
      width: writer.contentWidth * 0.42,
      size: 9.5,
      color: COLORS.muted,
    })
  }
  writer.y = Math.min(afterVehicle, writer.y) - 8
  writer.rule()

  writer.label('Package')
  writer.moneyRow(model.packageDescription, formatMoney(model.packageTotal, model.currency), true)
  writer.y -= 4
  writer.label('Payments received')
  if (model.payments.length) {
    for (const payment of model.payments) {
      const left = `${payment.date} — ${payment.method}${payment.reference ? ` · ${payment.reference}` : ''}`
      writer.ensure(16)
      const amountText = formatMoney(payment.amount, payment.currency)
      const before = writer.y
      writer.wrap(left, { size: 9.5, color: COLORS.muted, width: writer.contentWidth * 0.7 })
      writer.page.drawText(amountText, {
        x: MARGIN + writer.contentWidth - regular.widthOfTextAtSize(amountText, 9.5),
        y: before,
        size: 9.5,
        font: regular,
        color: COLORS.body,
      })
    }
  } else {
    writer.wrap('No payments recorded yet.', { size: 9.5, color: COLORS.muted })
  }
  writer.y -= 6
  writer.moneyRow('Total paid', formatMoney(model.totalPaid, model.currency))
  writer.moneyRow('Balance due', formatMoney(model.balanceDue, model.currency), true)
  writer.wrap(`Payment due: ${model.formatted.dueDate}`, { size: 9.5, color: COLORS.muted })
  writer.y -= 4
  writer.rule()

  writer.label('Included')
  for (const item of model.included.slice(0, 4)) {
    writer.ensure(16)
    writer.page.drawText('·', { x: MARGIN, y: writer.y, size: 12, font: bold, color: COLORS.gold })
    writer.wrap(item, { x: MARGIN + 12, width: writer.contentWidth - 12, size: 9.3, color: COLORS.muted })
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
    writer.y -= 4
    writer.rule()
    writer.label('Payment instructions')
    for (const line of instructionLines) writer.wrap(line, { size: 9.5, color: COLORS.muted })
  }

  if (model.clientNote) {
    writer.y -= 6
    writer.wrap(model.clientNote, { size: 9.5, color: COLORS.muted })
  }

  if (model.journey.secureLink) {
    writer.y -= 8
    writer.wrap('View your complete LankaLux journey', { font: bold, size: 10, color: COLORS.forest })
    writer.wrap(model.journey.secureLink, { size: 9, color: COLORS.gold })
  }

  const pages = doc.getPages()
  for (const p of pages) {
    p.drawText('Thank you for choosing LankaLux.', {
      x: MARGIN,
      y: 38,
      size: 9,
      font: regular,
      color: COLORS.forest,
    })
    p.drawText('LankaLux · Bespoke Journeys across Sri Lanka', {
      x: MARGIN,
      y: 26,
      size: 8,
      font: regular,
      color: COLORS.muted,
    })
  }

  return doc.save()
}
