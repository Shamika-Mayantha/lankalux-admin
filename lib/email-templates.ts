/**
 * Follow-up email templates for clients.
 * HTML uses the same branded itinerary/invoice email chrome.
 */

import { BRAND } from '@/config/brand'
import { renderFollowUpEmail } from '@/services/journey-copy'

export type TemplateId =
  | 'friendly_checkin'
  | 'gentle_reminder'
  | 'here_when_ready'
  | 'why_sri_lanka'
  | 'your_trip_your_way'
  | 'spots_youll_love'
  | 'one_step_closer'
  | 'post_trip_feedback'
  | 'custom_email'

export type TemplateRenderOpts = {
  clientName: string
  itineraryUrl?: string | null
  logoUrl?: string
}

export interface TemplateConfig {
  id: TemplateId
  name: string
  subject: string
  getHtml: (opts: TemplateRenderOpts) => string
  getText: (opts: TemplateRenderOpts) => string
}

export const DEFAULT_BRAND_LOGO_URL = `https://admin.lankalux.com${BRAND.logoSrc}`

/** Pre-filled feedback mailto; client can also reply to the message they received. */
export const FEEDBACK_MAILTO_PLAIN =
  'mailto:hello@lankalux.com?subject=' +
  encodeURIComponent('Feedback on my Sri Lanka trip with LankaLux') +
  '&body=' +
  encodeURIComponent(
    'Hello LankaLux team,\n\nI wanted to share a bit of feedback about my recent trip and how things went with the vehicle and driver.\n\n'
  )

function firstName(clientName: string) {
  return clientName?.trim() ? clientName.split(' ')[0] : 'there'
}

function brandedHtml(
  clientName: string,
  paragraphs: string[],
  opts?: { logoUrl?: string; ctaUrl?: string | null; ctaLabel?: string | null }
) {
  return renderFollowUpEmail({
    clientName,
    bodyText: paragraphs.join('\n\n'),
    logoUrl: opts?.logoUrl || DEFAULT_BRAND_LOGO_URL,
    ctaUrl: opts?.ctaUrl,
    ctaLabel: opts?.ctaLabel,
  }).html
}

function brandedText(clientName: string, paragraphs: string[]) {
  const name = firstName(clientName)
  return `Dear ${name},\n\n${paragraphs.join('\n\n')}\n\nWarm regards,\n${BRAND.name}`
}

/** Strip greeting/signature the HTML shell already renders. */
export function normalizeEditableBody(input: string): string {
  const raw = input.replace(/\r\n/g, '\n').trim()
  if (!raw) return ''

  let lines = raw.split('\n')

  if (lines.length > 0 && /^dear\s+.+,\s*$/i.test(lines[0].trim())) {
    lines = lines.slice(1)
    while (lines.length > 0 && lines[0].trim() === '') lines = lines.slice(1)
  }

  const lower = lines.map((l) => l.trim().toLowerCase())
  const warmIdx = lower.findIndex((l) => l === 'warm regards,' || l === 'warm regards')
  if (warmIdx >= 0) {
    lines = lines.slice(0, warmIdx)
  }

  return lines.join('\n').trim()
}

/** Build full email HTML from custom body text (for editable preview/send). */
export function buildHtmlFromBody(opts: {
  clientName: string
  bodyText: string
  logoUrl?: string
  ctaUrl?: string | null
  ctaLabel?: string | null
}): string {
  return renderFollowUpEmail({
    clientName: opts.clientName,
    bodyText: normalizeEditableBody(opts.bodyText),
    logoUrl: opts.logoUrl || DEFAULT_BRAND_LOGO_URL,
    ctaUrl: opts.ctaUrl,
    ctaLabel: opts.ctaLabel,
  }).html
}

export function followUpCta(templateId: TemplateId): { ctaUrl: string; ctaLabel: string } | null {
  if (templateId === 'post_trip_feedback') {
    return { ctaUrl: FEEDBACK_MAILTO_PLAIN, ctaLabel: 'Send us a quick note' }
  }
  return null
}

export const FOLLOW_UP_TEMPLATES: TemplateConfig[] = [
  {
    id: 'friendly_checkin',
    name: 'Request Received',
    subject: 'Thank You For Your Request',
    getHtml: ({ clientName, logoUrl }) =>
      brandedHtml(
        clientName,
        [
          'Thank you for your request. We truly appreciate you reaching out to us.',
          'We have received your details and are now working on creating your personalized journey through Sri Lanka.',
          'We will be sharing your itinerary with you shortly.',
          'If there is anything you would like us to include, feel free to let us know.',
        ],
        { logoUrl }
      ),
    getText: ({ clientName }) =>
      brandedText(clientName, [
        'Thank you for your request. We truly appreciate you reaching out to us.',
        'We have received your details and are now working on creating your personalized journey through Sri Lanka.',
        'We will be sharing your itinerary with you shortly.',
        'If there is anything you would like us to include, feel free to let us know.',
      ]),
  },
  {
    id: 'gentle_reminder',
    name: 'When You Are Ready',
    subject: 'Whenever You Are Ready To Continue',
    getHtml: ({ clientName, logoUrl }) =>
      brandedHtml(
        clientName,
        [
          'I just wanted to check in and see what you think about the itinerary we shared.',
          'If everything looks good, we can move forward with the next steps whenever you are ready. If you would like any changes, we can easily adjust it to better match what you have in mind.',
          'Happy to refine it until it feels just right for you.',
        ],
        { logoUrl }
      ),
    getText: ({ clientName }) =>
      brandedText(clientName, [
        'I just wanted to check in and see what you think about the itinerary we shared.',
        'If everything looks good, we can move forward with the next steps whenever you are ready. If you would like any changes, we can easily adjust it to better match what you have in mind.',
        'Happy to refine it until it feels just right for you.',
      ]),
  },
  {
    id: 'here_when_ready',
    name: 'Always Here For You',
    subject: 'Any Changes You Would Like Us To Make?',
    getHtml: ({ clientName, logoUrl }) =>
      brandedHtml(
        clientName,
        [
          'Just checking in to see if you had a chance to go through your itinerary.',
          'If there is anything you would like to change, improve, or explore differently, we would be more than happy to adjust it for you.',
          'Even small changes can make a big difference, so feel free to share your thoughts.',
        ],
        { logoUrl }
      ),
    getText: ({ clientName }) =>
      brandedText(clientName, [
        'Just checking in to see if you had a chance to go through your itinerary.',
        'If there is anything you would like to change, improve, or explore differently, we would be more than happy to adjust it for you.',
        'Even small changes can make a big difference, so feel free to share your thoughts.',
      ]),
  },
  {
    id: 'why_sri_lanka',
    name: 'Why Sri Lanka',
    subject: 'This Is What Makes The Journey Special',
    getHtml: ({ clientName, logoUrl }) =>
      brandedHtml(
        clientName,
        [
          'While reviewing your plan, we wanted to highlight how special this journey can be.',
          'Sri Lanka offers a mix of nature, culture, and unique experiences within a short distance, which allows your trip to feel diverse without being rushed.',
          'The itinerary we shared is designed to give you that balance, along with a more authentic and less crowded experience.',
          'Let us know how it feels to you so we can refine it further.',
        ],
        { logoUrl }
      ),
    getText: ({ clientName }) =>
      brandedText(clientName, [
        'While reviewing your plan, we wanted to highlight how special this journey can be.',
        'Sri Lanka offers a mix of nature, culture, and unique experiences within a short distance, which allows your trip to feel diverse without being rushed.',
        'The itinerary we shared is designed to give you that balance, along with a more authentic and less crowded experience.',
        'Let us know how it feels to you so we can refine it further.',
      ]),
  },
  {
    id: 'your_trip_your_way',
    name: 'Your Trip, Your Way',
    subject: "Let's Shape This Exactly The Way You Want",
    getHtml: ({ clientName, logoUrl }) =>
      brandedHtml(
        clientName,
        [
          'This journey is completely flexible and built around you.',
          'If there are places you would like to spend more time in, experiences you want to add, or anything you would prefer to skip, we can adjust everything accordingly.',
          'Just let us know what feels right to you, and we will tailor it further.',
        ],
        { logoUrl }
      ),
    getText: ({ clientName }) =>
      brandedText(clientName, [
        'This journey is completely flexible and built around you.',
        'If there are places you would like to spend more time in, experiences you want to add, or anything you would prefer to skip, we can adjust everything accordingly.',
        'Just let us know what feels right to you, and we will tailor it further.',
      ]),
  },
  {
    id: 'spots_youll_love',
    name: 'Spots We Think You Will Love',
    subject: 'A Few Places You Might Really Enjoy',
    getHtml: ({ clientName, logoUrl }) =>
      brandedHtml(
        clientName,
        [
          'After reviewing your preferences again, there are a few places in your itinerary that we feel you will truly enjoy.',
          'These include some beautiful locations that are less crowded, along with experiences that match your interests.',
          'If you would like, we can highlight or expand these parts further in your plan.',
          'Let us know your thoughts.',
        ],
        { logoUrl }
      ),
    getText: ({ clientName }) =>
      brandedText(clientName, [
        'After reviewing your preferences again, there are a few places in your itinerary that we feel you will truly enjoy.',
        'These include some beautiful locations that are less crowded, along with experiences that match your interests.',
        'If you would like, we can highlight or expand these parts further in your plan.',
        'Let us know your thoughts.',
      ]),
  },
  {
    id: 'one_step_closer',
    name: 'One Step Closer',
    subject: 'Ready To Secure Your Journey?',
    getHtml: ({ clientName, logoUrl }) =>
      brandedHtml(
        clientName,
        [
          'Everything is in place for your trip, and we are ready to proceed whenever you are.',
          'Once you are happy with the plan, we can move forward with securing the accommodations and arrangements for your dates.',
          'Just let us know, and we will guide you through the next step.',
        ],
        { logoUrl }
      ),
    getText: ({ clientName }) =>
      brandedText(clientName, [
        'Everything is in place for your trip, and we are ready to proceed whenever you are.',
        'Once you are happy with the plan, we can move forward with securing the accommodations and arrangements for your dates.',
        'Just let us know, and we will guide you through the next step.',
      ]),
  },
  {
    id: 'post_trip_feedback',
    name: 'How was your trip?',
    subject: 'We would love to hear how Sri Lanka was for you',
    getHtml: ({ clientName, logoUrl }) =>
      brandedHtml(
        clientName,
        [
          'We hope you are settling back in after your time with us. We are thinking of you and hoping Sri Lanka left you with good memories, beautiful views you will not forget, and maybe a few new favourite moments.',
          'If you have a spare minute, we would really appreciate hearing how it all felt in real life. How was your driver? Was the car comfortable and did you feel looked after on the road? Your honest take helps us thank people who did a great job and fix anything that was not quite right.',
          'You do not need to write a lot. A few sentences is more than enough. Just reply to this email, or tap the button below if that is easier. Either way it comes straight to us.',
          'Thank you for choosing LankaLux. Having you travel with us meant a great deal, and we hope we get to welcome you back one day.',
        ],
        { logoUrl, ...followUpCta('post_trip_feedback') }
      ),
    getText: ({ clientName }) =>
      brandedText(clientName, [
        'We hope you are settling back in after your time with us. We are thinking of you and hoping Sri Lanka left you with good memories, beautiful views you will not forget, and maybe a few new favourite moments.',
        'If you have a spare minute, we would really appreciate hearing how it all felt in real life. How was your driver? Was the car comfortable and did you feel looked after on the road? Your honest take helps us thank people who did a great job and fix anything that was not quite right.',
        'You do not need to write a lot. A few sentences is more than enough. Just reply to this email, or use the link in the email if you prefer. Either way it comes straight to us.',
        'Thank you for choosing LankaLux. Having you travel with us meant a great deal, and we hope we get to welcome you back one day.',
      ]),
  },
  {
    id: 'custom_email',
    name: 'Custom email (type your own)',
    subject: 'A note from LankaLux',
    getHtml: ({ clientName, logoUrl }) =>
      brandedHtml(clientName, ['Compose your message in the admin preview and send — your text will replace this placeholder.'], {
        logoUrl,
      }),
    getText: ({ clientName }) => `Dear ${firstName(clientName)},\n\n`,
  },
]

export function getTemplate(id: TemplateId): TemplateConfig | undefined {
  return FOLLOW_UP_TEMPLATES.find((t) => t.id === id)
}
