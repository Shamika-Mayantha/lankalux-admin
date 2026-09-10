import { Font } from '@react-pdf/renderer'

let fontsRegistered = false

export function registerLankaLuxDocumentFonts() {
  if (fontsRegistered) return
  fontsRegistered = true
  Font.register({
    family: 'Be Vietnam Pro',
    fonts: [
      { src: '/fonts/be-vietnam-pro-400.ttf', fontWeight: 400 },
      { src: '/fonts/be-vietnam-pro-600.ttf', fontWeight: 600 },
      { src: '/fonts/be-vietnam-pro-700.ttf', fontWeight: 700 },
    ],
  })
  Font.register({
    family: 'Open Sans',
    fonts: [
      { src: '/fonts/open-sans-400.ttf', fontWeight: 400 },
      { src: '/fonts/open-sans-600.ttf', fontWeight: 600 },
    ],
  })
  Font.registerHyphenationCallback((word) => [word])
}
