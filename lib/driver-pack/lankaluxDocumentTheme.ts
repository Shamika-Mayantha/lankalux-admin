import { BRAND } from '@/config/brand'

/** Shared LankaLux operational-document tokens. Values come from config/brand.ts. */
export const DOC = {
  background: BRAND.background,
  cream: BRAND.cream,
  forest: BRAND.forest,
  forestSoft: BRAND.forestSoft,
  gold: BRAND.gold,
  goldSoft: BRAND.goldSoft,
  text: BRAND.text,
  muted: BRAND.textMuted,
  border: 'rgba(177, 133, 68, 0.45)',
  borderSoft: 'rgba(177, 133, 68, 0.28)',
  line: BRAND.border,
  fontDisplay: 'Be Vietnam Pro',
  fontBody: 'Open Sans',
  logoSrc: BRAND.logoSrc,
  tagline: BRAND.tagline,
  name: BRAND.name,
} as const
