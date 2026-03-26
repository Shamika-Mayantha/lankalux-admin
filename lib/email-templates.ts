/**
 * Follow-up email templates for clients.
 * Elegant, humanised tone. Each includes a CTA button.
 */

const BASE_URL = 'https://admin.lankalux.com'

const sharedStyles = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Georgia', 'Times New Roman', serif; line-height: 1.8; color: #2c2c2c; background-color: #f5f5f5; padding: 0; margin: 0; }
  .email-container { max-width: 600px; margin: 0 auto; background-color: #ffffff; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.08); }
  .header { background: linear-gradient(135deg, #1a1a1a 0%, #2c2c2c 100%); padding: 40px 20px; text-align: center; border-bottom: 4px solid #c8a45d; }
  .logo { width: 80px; height: 80px; margin: 0 auto 20px; display: block; border-radius: 50%; object-fit: cover; }
  .header h1 { color: #c8a45d; font-size: 32px; font-weight: 300; letter-spacing: 2px; margin: 0; font-family: 'Georgia', serif; }
  .header .subtitle { color: #ffffff; font-size: 14px; margin-top: 8px; letter-spacing: 1px; text-transform: uppercase; }
  .content { padding: 40px 30px; background-color: #ffffff; }
  .greeting { font-size: 18px; color: #2c2c2c; margin-bottom: 24px; font-weight: 400; }
  .body-text { font-size: 16px; color: #555; margin-bottom: 22px; line-height: 1.85; }
  .cta-section { text-align: center; margin: 36px 0; padding: 28px 0; border-top: 1px solid #e8e8e8; border-bottom: 1px solid #e8e8e8; }
  .cta-button { display: inline-block; background: linear-gradient(135deg, #c8a45d 0%, #b8944d 100%); color: #ffffff !important; padding: 16px 40px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px; letter-spacing: 0.5px; box-shadow: 0 4px 12px rgba(200, 164, 93, 0.25); text-transform: uppercase; }
  .cta-button:hover { background: linear-gradient(135deg, #b8944d 0%, #a8843d 100%); box-shadow: 0 6px 16px rgba(200, 164, 93, 0.35); }
  .signature { margin-top: 32px; font-size: 15px; color: #2c2c2c; }
  .signature-name { font-weight: 600; color: #c8a45d; margin-top: 6px; font-size: 15px; }
  .footer { background-color: #1a1a1a; padding: 25px 20px; text-align: center; color: #999; font-size: 12px; }
  .footer p { margin: 5px 0; }
`

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

export interface TemplateConfig {
  id: TemplateId
  name: string
  subject: string
  getHtml: (opts: { clientName: string; itineraryUrl?: string | null }) => string
  getText: (opts: { clientName: string; itineraryUrl?: string | null }) => string
}

const logoUrl = `${BASE_URL}/favicon.png`

/** Pre-filled feedback mailto; client can also reply to the message they received. Update the address if your team uses a different inbox. */
const FEEDBACK_MAILTO_PLAIN =
  'mailto:info@lankalux.com?subject=' +
  encodeURIComponent('Feedback on my Sri Lanka trip with LankaLux') +
  '&body=' +
  encodeURIComponent(
    'Hello LankaLux team,\n\nI wanted to share a bit of feedback about my recent trip and how things went with the vehicle and driver.\n\n'
  )
/** Same URL with & escaped for use inside HTML href attributes */
const FEEDBACK_MAILTO_HTML = FEEDBACK_MAILTO_PLAIN.replace(/&/g, '&amp;')

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Turn plain text body into HTML paragraphs for the email content area */
export function bodyTextToHtml(bodyText: string): string {
  const paragraphs = bodyText
    .trim()
    .split(/\n\n+/)
    .filter((p) => p.trim().length > 0)
  if (paragraphs.length === 0) return '<p class="body-text">&nbsp;</p>'
  return paragraphs
    .map((p) => `<p class="body-text">${escapeHtml(p.trim()).replace(/\n/g, '<br />')}</p>`)
    .join('\n      ')
}

/** Build full email HTML from custom body text (for editable preview/send) */
export function buildHtmlFromBody(opts: {
  clientName: string
  bodyHtml: string
  itineraryUrl?: string | null
}): string {
  const firstName = opts.clientName?.trim() ? opts.clientName.split(' ')[0] : 'there'
  const buttonUrl = opts.itineraryUrl || BASE_URL
  const buttonText = opts.itineraryUrl ? 'View your itinerary' : 'Get in touch'
  const year = new Date().getFullYear()
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>${sharedStyles}</style>
</head>
<body>
  <div class="email-container">
    <div class="header">
      <a href="https://lankalux.com" style="text-decoration: none; display: block;">
        <img src="${logoUrl}" alt="LankaLux" class="logo" />
      </a>
      <h1>LankaLux</h1>
      <div class="subtitle">Journey</div>
    </div>
    <div class="content">
      <div class="greeting">Dear ${firstName},</div>
      ${opts.bodyHtml}
      <div class="cta-section">
        <a href="${buttonUrl}" class="cta-button">${buttonText}</a>
      </div>
      <div class="signature">
        <p>Warm regards,</p>
        <p class="signature-name">LankaLux Team</p>
      </div>
    </div>
    <div class="footer">
      <p>© ${year} LankaLux. Your journey to Sri Lanka begins here.</p>
    </div>
  </div>
</body>
</html>`
}

const signatureHtml = `
      <div class="signature">
        <p>Warm regards,</p>
        <p class="signature-name">LankaLux Team</p>
      </div>`

const footerHtml = (year: number) => `
    <div class="footer">
      <p>© ${year} LankaLux. Your journey to Sri Lanka begins here.</p>
    </div>`

function emailShell(opts: {
  firstName: string
  bodyParagraphs: string[]
  buttonUrl: string
  buttonText: string
}): string {
  const year = new Date().getFullYear()
  const body = opts.bodyParagraphs.map((p) => `<p class="body-text">${p}</p>`).join('\n      ')
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>${sharedStyles}</style>
</head>
<body>
  <div class="email-container">
    <div class="header">
      <a href="https://lankalux.com" style="text-decoration: none; display: block;">
        <img src="${logoUrl}" alt="LankaLux" class="logo" />
      </a>
      <h1>LankaLux</h1>
      <div class="subtitle">Journey</div>
    </div>
    <div class="content">
      <div class="greeting">Dear ${opts.firstName},</div>
      ${body}
      <div class="cta-section">
        <a href="${opts.buttonUrl}" class="cta-button">${opts.buttonText}</a>
      </div>
      ${signatureHtml}
    </div>
    ${footerHtml(year)}
  </div>
</body>
</html>`
}

export const FOLLOW_UP_TEMPLATES: TemplateConfig[] = [
  {
    id: 'friendly_checkin',
    name: 'Request Received',
    subject: 'Thank You For Your Request',
    getHtml: ({ clientName, itineraryUrl }) => {
      const firstName = clientName?.trim() ? clientName.split(' ')[0] : 'there'
      const buttonUrl = itineraryUrl || BASE_URL
      const buttonText = itineraryUrl ? 'View your itinerary' : 'Get in touch'
      return emailShell({
        firstName,
        buttonUrl,
        buttonText,
        bodyParagraphs: [
          'Thank you for your request. We truly appreciate you reaching out to us.',
          'We have received your details and are now working on creating your personalized journey through Sri Lanka.',
          'We will be sharing your itinerary with you shortly.',
          'If there is anything you would like us to include, feel free to let us know.',
        ],
      })
    },
    getText: ({ clientName }) => {
      const firstName = clientName?.trim() ? clientName.split(' ')[0] : 'there'
      return `Dear ${firstName},\n\nThank you for your request. We truly appreciate you reaching out to us.\n\nWe have received your details and are now working on creating your personalized journey through Sri Lanka.\n\nWe will be sharing your itinerary with you shortly.\n\nIf there is anything you would like us to include, feel free to let us know.\n\nWarm regards,\nLankaLux Team`
    },
  },
  {
    id: 'gentle_reminder',
    name: 'When You Are Ready',
    subject: 'Whenever You Are Ready To Continue',
    getHtml: ({ clientName, itineraryUrl }) => {
      const firstName = clientName?.trim() ? clientName.split(' ')[0] : 'there'
      const buttonUrl = itineraryUrl || BASE_URL
      const buttonText = itineraryUrl ? 'View your itinerary' : 'Get in touch'
      return emailShell({
        firstName,
        buttonUrl,
        buttonText,
        bodyParagraphs: [
          'I just wanted to check in and see what you think about the itinerary we shared.',
          'If everything looks good, we can move forward with the next steps whenever you are ready. If you would like any changes, we can easily adjust it to better match what you have in mind.',
          'Happy to refine it until it feels just right for you.',
        ],
      })
    },
    getText: ({ clientName }) => {
      const firstName = clientName?.trim() ? clientName.split(' ')[0] : 'there'
      return `Dear ${firstName},\n\nI just wanted to check in and see what you think about the itinerary we shared.\n\nIf everything looks good, we can move forward with the next steps whenever you are ready. If you would like any changes, we can easily adjust it to better match what you have in mind.\n\nHappy to refine it until it feels just right for you.\n\nWarm regards,\nLankaLux Team`
    },
  },
  {
    id: 'here_when_ready',
    name: 'Always Here For You',
    subject: 'Any Changes You Would Like Us To Make?',
    getHtml: ({ clientName, itineraryUrl }) => {
      const firstName = clientName?.trim() ? clientName.split(' ')[0] : 'there'
      const buttonUrl = itineraryUrl || BASE_URL
      const buttonText = itineraryUrl ? 'View your itinerary' : 'Get in touch'
      return emailShell({
        firstName,
        buttonUrl,
        buttonText,
        bodyParagraphs: [
          'Just checking in to see if you had a chance to go through your itinerary.',
          'If there is anything you would like to change, improve, or explore differently, we would be more than happy to adjust it for you.',
          'Even small changes can make a big difference, so feel free to share your thoughts.',
        ],
      })
    },
    getText: ({ clientName }) => {
      const firstName = clientName?.trim() ? clientName.split(' ')[0] : 'there'
      return `Dear ${firstName},\n\nJust checking in to see if you had a chance to go through your itinerary.\n\nIf there is anything you would like to change, improve, or explore differently, we would be more than happy to adjust it for you.\n\nEven small changes can make a big difference, so feel free to share your thoughts.\n\nWarm regards,\nLankaLux Team`
    },
  },
  {
    id: 'why_sri_lanka',
    name: 'Why Sri Lanka',
    subject: 'This Is What Makes The Journey Special',
    getHtml: ({ clientName, itineraryUrl }) => {
      const firstName = clientName?.trim() ? clientName.split(' ')[0] : 'there'
      const buttonUrl = itineraryUrl || BASE_URL
      const buttonText = itineraryUrl ? 'View your itinerary' : 'Get in touch'
      return emailShell({
        firstName,
        buttonUrl,
        buttonText,
        bodyParagraphs: [
          'While reviewing your plan, we wanted to highlight how special this journey can be.',
          'Sri Lanka offers a mix of nature, culture, and unique experiences within a short distance, which allows your trip to feel diverse without being rushed.',
          'The itinerary we shared is designed to give you that balance, along with a more authentic and less crowded experience.',
          'Let us know how it feels to you so we can refine it further.',
        ],
      })
    },
    getText: ({ clientName }) => {
      const firstName = clientName?.trim() ? clientName.split(' ')[0] : 'there'
      return `Dear ${firstName},\n\nWhile reviewing your plan, we wanted to highlight how special this journey can be.\n\nSri Lanka offers a mix of nature, culture, and unique experiences within a short distance, which allows your trip to feel diverse without being rushed.\n\nThe itinerary we shared is designed to give you that balance, along with a more authentic and less crowded experience.\n\nLet us know how it feels to you so we can refine it further.\n\nWarm regards,\nLankaLux Team`
    },
  },
  {
    id: 'your_trip_your_way',
    name: 'Your Trip, Your Way',
    subject: "Let's Shape This Exactly The Way You Want",
    getHtml: ({ clientName, itineraryUrl }) => {
      const firstName = clientName?.trim() ? clientName.split(' ')[0] : 'there'
      const buttonUrl = itineraryUrl || BASE_URL
      const buttonText = itineraryUrl ? 'View your itinerary' : 'Get in touch'
      return emailShell({
        firstName,
        buttonUrl,
        buttonText,
        bodyParagraphs: [
          'This journey is completely flexible and built around you.',
          'If there are places you would like to spend more time in, experiences you want to add, or anything you would prefer to skip, we can adjust everything accordingly.',
          'Just let us know what feels right to you, and we will tailor it further.',
        ],
      })
    },
    getText: ({ clientName }) => {
      const firstName = clientName?.trim() ? clientName.split(' ')[0] : 'there'
      return `Dear ${firstName},\n\nThis journey is completely flexible and built around you.\n\nIf there are places you would like to spend more time in, experiences you want to add, or anything you would prefer to skip, we can adjust everything accordingly.\n\nJust let us know what feels right to you, and we will tailor it further.\n\nWarm regards,\nLankaLux Team`
    },
  },
  {
    id: 'spots_youll_love',
    name: 'Spots We Think You Will Love',
    subject: 'A Few Places You Might Really Enjoy',
    getHtml: ({ clientName, itineraryUrl }) => {
      const firstName = clientName?.trim() ? clientName.split(' ')[0] : 'there'
      const buttonUrl = itineraryUrl || BASE_URL
      const buttonText = itineraryUrl ? 'View your itinerary' : 'Get in touch'
      return emailShell({
        firstName,
        buttonUrl,
        buttonText,
        bodyParagraphs: [
          'After reviewing your preferences again, there are a few places in your itinerary that we feel you will truly enjoy.',
          'These include some beautiful locations that are less crowded, along with experiences that match your interests.',
          'If you would like, we can highlight or expand these parts further in your plan.',
          'Let us know your thoughts.',
        ],
      })
    },
    getText: ({ clientName }) => {
      const firstName = clientName?.trim() ? clientName.split(' ')[0] : 'there'
      return `Dear ${firstName},\n\nAfter reviewing your preferences again, there are a few places in your itinerary that we feel you will truly enjoy.\n\nThese include some beautiful locations that are less crowded, along with experiences that match your interests.\n\nIf you would like, we can highlight or expand these parts further in your plan.\n\nLet us know your thoughts.\n\nWarm regards,\nLankaLux Team`
    },
  },
  {
    id: 'one_step_closer',
    name: 'One Step Closer',
    subject: 'Ready To Secure Your Journey?',
    getHtml: ({ clientName, itineraryUrl }) => {
      const firstName = clientName?.trim() ? clientName.split(' ')[0] : 'there'
      const buttonUrl = itineraryUrl || BASE_URL
      const buttonText = itineraryUrl ? 'View your itinerary' : 'Get in touch'
      return emailShell({
        firstName,
        buttonUrl,
        buttonText,
        bodyParagraphs: [
          'Everything is in place for your trip, and we are ready to proceed whenever you are.',
          'Once you are happy with the plan, we can move forward with securing the accommodations and arrangements for your dates.',
          'Just let us know, and we will guide you through the next step.',
        ],
      })
    },
    getText: ({ clientName }) => {
      const firstName = clientName?.trim() ? clientName.split(' ')[0] : 'there'
      return `Dear ${firstName},\n\nEverything is in place for your trip, and we are ready to proceed whenever you are.\n\nOnce you are happy with the plan, we can move forward with securing the accommodations and arrangements for your dates.\n\nJust let us know, and we will guide you through the next step.\n\nWarm regards,\nLankaLux Team`
    },
  },
  {
    id: 'post_trip_feedback',
    name: 'How was your trip?',
    subject: 'We would love to hear how Sri Lanka was for you',
    getHtml: ({ clientName }) => {
      const firstName = clientName?.trim() ? clientName.split(' ')[0] : 'there'
      return emailShell({
        firstName,
        buttonUrl: FEEDBACK_MAILTO_HTML,
        buttonText: 'Send us a quick note',
        bodyParagraphs: [
          'We hope you are settling back in after your time with us. We are thinking of you and hoping Sri Lanka left you with good memories, beautiful views you will not forget, and maybe a few new favourite moments.',
          'If you have a spare minute, we would really appreciate hearing how it all felt in real life. How was your driver? Was the car comfortable and did you feel looked after on the road? Your honest take helps us thank people who did a great job and fix anything that was not quite right.',
          'You do not need to write a lot. A few sentences is more than enough. Just reply to this email, or tap the button below if that is easier. Either way it comes straight to us.',
          'Thank you for choosing LankaLux. Having you travel with us meant a great deal, and we hope we get to welcome you back one day.',
        ],
      })
    },
    getText: ({ clientName }) => {
      const firstName = clientName?.trim() ? clientName.split(' ')[0] : 'there'
      return `Dear ${firstName},\n\nWe hope you are settling back in after your time with us. We are thinking of you and hoping Sri Lanka left you with good memories, beautiful views you will not forget, and maybe a few new favourite moments.\n\nIf you have a spare minute, we would really appreciate hearing how it all felt in real life. How was your driver? Was the car comfortable and did you feel looked after on the road? Your honest take helps us thank people who did a great job and fix anything that was not quite right.\n\nYou do not need to write a lot. A few sentences is more than enough. Just reply to this email, or use the link in the email if you prefer. Either way it comes straight to us.\n\nThank you for choosing LankaLux. Having you travel with us meant a great deal, and we hope we get to welcome you back one day.\n\nWarm regards,\nLankaLux Team`
    },
  },
  {
    id: 'custom_email',
    name: 'Custom email (type your own)',
    subject: 'A note from LankaLux',
    getHtml: ({ clientName, itineraryUrl }) => {
      const firstName = clientName?.trim() ? clientName.split(' ')[0] : 'there'
      const buttonUrl = itineraryUrl || BASE_URL
      const buttonText = itineraryUrl ? 'View your itinerary' : 'Get in touch'
      return emailShell({
        firstName,
        buttonUrl,
        buttonText,
        bodyParagraphs: [
          'Compose your message in the admin preview and send — your text will replace this placeholder.',
        ],
      })
    },
    getText: ({ clientName }) => {
      const firstName = clientName?.trim() ? clientName.split(' ')[0] : 'there'
      return `Dear ${firstName},\n\n`
    },
  },
]

export function getTemplate(id: TemplateId): TemplateConfig | undefined {
  return FOLLOW_UP_TEMPLATES.find((t) => t.id === id)
}
