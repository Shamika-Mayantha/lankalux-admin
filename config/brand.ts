/**
 * LankaLux brand tokens copied from the public website
 * (`lankalux-design.css` in Shamika-Mayantha/lankalux).
 * Do not invent new hex values.
 */
export const BRAND = {
  name: 'LankaLux',
  product: 'LankaLux Admin Console',
  tagline: 'Private journeys, exceptional care',
  logoSrc: '/brand/lankalux-logo.png',
  logoMarkSrc: '/brand/lankalux-mark.png',
  logoStackedSrc: '/brand/lankalux-logo-stacked.png',
  faviconSrc: '/brand/lankalux-favicon.png',

  /** Warm ivory page background */
  background: '#F9F4EB',
  /** Soft cream / beige surfaces */
  cream: '#F1E9DA',
  beige: '#F1E9DA',
  /** White form/card inner */
  surface: '#FFFFFF',
  /** Forest green — headings, primary buttons, sidebar ink */
  forest: '#1A2A1D',
  forestSoft: '#243328',
  /** Gold accent — never large fills */
  gold: '#B18544',
  goldDark: '#B18544',
  goldSoft: 'rgba(177, 133, 68, 0.18)',
  /** Body text */
  text: '#252523',
  textMuted: '#6b6b66',
  border: 'rgba(26, 42, 29, 0.12)',
  borderStrong: 'rgba(26, 42, 29, 0.22)',
  /** Secondary button outline from lankalux-design.css */
  borderButton: 'rgba(26, 42, 29, 0.28)',
  ease: 'cubic-bezier(0.22, 1, 0.36, 1)',
  radius: '4px',
  shadow: '0 24px 60px rgba(26, 42, 29, 0.18)',
  fontDisplay: '"Be Vietnam Pro", sans-serif',
  fontBody: '"Open Sans", sans-serif',

  includedServices: [
    'Private chauffeur-driven vehicle throughout the journey',
    'Airport meet and greet on arrival',
    'Handcrafted daily itinerary with paced travel',
    '24/7 LankaLux journey support',
  ],
  importantInformation: [
    'This itinerary is a personalised proposal and can be adjusted at any time.',
    'Wildlife sightings, weather and road conditions may lead to gentle changes of plan.',
    'Hotel names, where shown, are suggestions pending availability.',
  ],
}

/** @deprecated use BRAND.gold — kept so older console code still type-checks during the restyle */
export const gold = BRAND.gold
