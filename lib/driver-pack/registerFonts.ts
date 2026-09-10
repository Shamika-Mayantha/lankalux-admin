import { Font } from '@react-pdf/renderer'

let fontsRegistered = false

export function registerLankaLuxDocumentFonts() {
  if (fontsRegistered) return
  fontsRegistered = true
  Font.register({
    family: 'Be Vietnam Pro',
    fonts: [
      { src: '/fonts/be-vietnam-pro-400.ttf', fontWeight: 400, fontStyle: 'normal' },
      { src: '/fonts/be-vietnam-pro-600.ttf', fontWeight: 600, fontStyle: 'normal' },
      { src: '/fonts/be-vietnam-pro-700.ttf', fontWeight: 700, fontStyle: 'normal' },
    ],
  })
  Font.register({
    family: 'Open Sans',
    fonts: [
      { src: '/fonts/open-sans-400.ttf', fontWeight: 400, fontStyle: 'normal' },
      { src: '/fonts/open-sans-600.ttf', fontWeight: 600, fontStyle: 'normal' },
    ],
  })
  Font.registerHyphenationCallback((word) => [word])
}
