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
  .signature-name { font-weight: 600; color: #c8a45d; margin-top: 6px; }
  .footer { background-color: #1a1a1a; padding: 25px 20px; text-align: center; color: #999; font-size: 12px; }
  .footer p { margin: 5px 0; }
`

export type TemplateId = 'friendly_checkin' | 'gentle_reminder' | 'here_when_ready'

export interface TemplateConfig {
  id: TemplateId
  name: string
  subject: string
  getHtml: (opts: { clientName: string; itineraryUrl?: string | null }) => string
  getText: (opts: { clientName: string; itineraryUrl?: string | null }) => string
}

const logoUrl = `${BASE_URL}/favicon.png`

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
  const firstName = opts.clientName?.split(' ')[0] || 'there'
  const buttonUrl = opts.itineraryUrl || BASE_URL
  const buttonText = opts.itineraryUrl ? 'View your itinerary' : 'Get in touch'
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
      <div class="greeting">Hello ${firstName},</div>
      ${opts.bodyHtml}
      <div class="cta-section">
        <a href="${buttonUrl}" class="cta-button">${buttonText}</a>
      </div>
      <div class="signature">
        <p>Warm regards,</p>
        <p class="signature-name">The LankaLux Team</p>
      </div>
    </div>
    <div class="footer">
      <p>© ${new Date().getFullYear()} LankaLux. Your journey to Sri Lanka begins here.</p>
    </div>
  </div>
</body>
</html>`
}

export const FOLLOW_UP_TEMPLATES: TemplateConfig[] = [
  {
    id: 'friendly_checkin',
    name: 'A quick note',
    subject: 'A quick note about your Sri Lanka journey',
    getHtml: ({ clientName, itineraryUrl }) => {
      const firstName = clientName?.split(' ')[0] || 'there'
      const buttonUrl = itineraryUrl || BASE_URL
      const buttonText = itineraryUrl ? 'View your itinerary' : 'Get in touch'
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
      <div class="greeting">Hello ${firstName},</div>
      <p class="body-text">
        I was thinking of you and wanted to reach out. I hope the itinerary we put together feels right and that you are as excited about it as we are.
      </p>
      <p class="body-text">
        If you have any questions or would like to change anything, just reply to this email. There is no rush at all.
      </p>
      <div class="cta-section">
        <a href="${buttonUrl}" class="cta-button">${buttonText}</a>
      </div>
      <div class="signature">
        <p>Warm regards,</p>
        <p class="signature-name">The LankaLux Team</p>
      </div>
    </div>
    <div class="footer">
      <p>© ${new Date().getFullYear()} LankaLux. Your journey to Sri Lanka begins here.</p>
    </div>
  </div>
</body>
</html>`
    },
    getText: ({ clientName }) => {
      const firstName = clientName?.split(' ')[0] || 'there'
      return `Hello ${firstName},\n\nI was thinking of you and wanted to reach out. I hope the itinerary we put together feels right and that you are as excited about it as we are.\n\nIf you have any questions or would like to change anything, just reply to this email. There is no rush at all.`
    },
  },
  {
    id: 'gentle_reminder',
    name: 'When you are ready',
    subject: 'Your itinerary is ready when you are',
    getHtml: ({ clientName, itineraryUrl }) => {
      const firstName = clientName?.split(' ')[0] || 'there'
      const buttonUrl = itineraryUrl || BASE_URL
      const buttonText = itineraryUrl ? 'View your itinerary' : 'Visit LankaLux'
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
      <div class="greeting">Hello ${firstName},</div>
      <p class="body-text">
        Life gets busy, and we understand. Your Sri Lanka itinerary is here whenever you need it.
      </p>
      <p class="body-text">
        When you are ready to take the next step or have any questions, we are only an email away. No pressure at all.
      </p>
      <div class="cta-section">
        <a href="${buttonUrl}" class="cta-button">${buttonText}</a>
      </div>
      <div class="signature">
        <p>Warm regards,</p>
        <p class="signature-name">The LankaLux Team</p>
      </div>
    </div>
    <div class="footer">
      <p>© ${new Date().getFullYear()} LankaLux. Your journey to Sri Lanka begins here.</p>
    </div>
  </div>
</body>
</html>`
    },
    getText: ({ clientName }) => {
      const firstName = clientName?.split(' ')[0] || 'there'
      return `Hello ${firstName},\n\nLife gets busy, and we understand. Your Sri Lanka itinerary is here whenever you need it.\n\nWhen you are ready to take the next step or have any questions, we are only an email away. No pressure at all.`
    },
  },
  {
    id: 'here_when_ready',
    name: 'Always here for you',
    subject: 'We are here whenever you need us',
    getHtml: ({ clientName, itineraryUrl }) => {
      const firstName = clientName?.split(' ')[0] || 'there'
      const buttonUrl = itineraryUrl || BASE_URL
      const buttonText = itineraryUrl ? 'View your itinerary' : 'Get in touch'
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
      <div class="greeting">Hello ${firstName},</div>
      <p class="body-text">
        A short note to say we are here whenever you would like to chat, adjust your plans, or simply look through your itinerary again. There is no deadline.
      </p>
      <p class="body-text">
        If something catches your eye or you have questions, just reply. We would love to hear from you.
      </p>
      <div class="cta-section">
        <a href="${buttonUrl}" class="cta-button">${buttonText}</a>
      </div>
      <div class="signature">
        <p>Warm regards,</p>
        <p class="signature-name">The LankaLux Team</p>
      </div>
    </div>
    <div class="footer">
      <p>© ${new Date().getFullYear()} LankaLux. Your journey to Sri Lanka begins here.</p>
    </div>
  </div>
</body>
</html>`
    },
    getText: ({ clientName }) => {
      const firstName = clientName?.split(' ')[0] || 'there'
      return `Hello ${firstName},\n\nA short note to say we are here whenever you would like to chat, adjust your plans, or simply look through your itinerary again. There is no deadline.\n\nIf something catches your eye or you have questions, just reply. We would love to hear from you.`
    },
  },
]

export function getTemplate(id: TemplateId): TemplateConfig | undefined {
  return FOLLOW_UP_TEMPLATES.find((t) => t.id === id)
}
