/**
 * Follow-up email templates for clients.
 * Each template is humanized and includes a CTA button.
 */

const BASE_URL = 'https://admin.lankalux.com'

const sharedStyles = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Georgia', 'Times New Roman', serif; line-height: 1.8; color: #2c2c2c; background-color: #f5f5f5; padding: 0; margin: 0; }
  .email-container { max-width: 600px; margin: 0 auto; background-color: #ffffff; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); }
  .header { background: linear-gradient(135deg, #1a1a1a 0%, #2c2c2c 100%); padding: 40px 20px; text-align: center; border-bottom: 4px solid #c8a45d; }
  .logo { width: 80px; height: 80px; margin: 0 auto 20px; display: block; border-radius: 50%; object-fit: cover; }
  .header h1 { color: #c8a45d; font-size: 32px; font-weight: 300; letter-spacing: 2px; margin: 0; font-family: 'Georgia', serif; }
  .header .subtitle { color: #ffffff; font-size: 14px; margin-top: 8px; letter-spacing: 1px; text-transform: uppercase; }
  .content { padding: 40px 30px; background-color: #ffffff; }
  .greeting { font-size: 18px; color: #2c2c2c; margin-bottom: 20px; font-weight: 400; }
  .body-text { font-size: 16px; color: #555; margin-bottom: 20px; line-height: 1.8; }
  .cta-section { text-align: center; margin: 35px 0; padding: 25px 0; border-top: 1px solid #e0e0e0; border-bottom: 1px solid #e0e0e0; }
  .cta-button { display: inline-block; background: linear-gradient(135deg, #c8a45d 0%, #b8944d 100%); color: #ffffff !important; padding: 16px 40px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px; letter-spacing: 0.5px; box-shadow: 0 4px 12px rgba(200, 164, 93, 0.3); text-transform: uppercase; }
  .cta-button:hover { background: linear-gradient(135deg, #b8944d 0%, #a8843d 100%); box-shadow: 0 6px 16px rgba(200, 164, 93, 0.4); }
  .signature { margin-top: 30px; font-size: 15px; color: #2c2c2c; }
  .signature-name { font-weight: 600; color: #c8a45d; margin-top: 5px; }
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

export const FOLLOW_UP_TEMPLATES: TemplateConfig[] = [
  {
    id: 'friendly_checkin',
    name: 'Friendly check-in',
    subject: 'Quick check-in – your Sri Lanka itinerary',
    getHtml: ({ clientName, itineraryUrl }) => {
      const firstName = clientName?.split(' ')[0] || 'there'
      const buttonUrl = itineraryUrl || `${BASE_URL}`
      const buttonText = itineraryUrl ? 'View my itinerary' : 'Get in touch'
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
      <div class="greeting">Hi ${firstName},</div>
      <p class="body-text">
        I wanted to drop a quick note to see how you're doing. I hope the itinerary we put together is sitting well with you—we had a great time crafting it.
      </p>
      <p class="body-text">
        If anything's on your mind—questions, tweaks, or you just want to chat through the details—reply to this email anytime. No rush at all.
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
    getText: ({ clientName, itineraryUrl }) => {
      const firstName = clientName?.split(' ')[0] || 'there'
      let t = `Hi ${firstName},\n\nI wanted to drop a quick note to see how you're doing. I hope the itinerary we put together is sitting well with you.\n\nIf anything's on your mind—questions, tweaks, or you just want to chat through the details—reply to this email anytime. No rush at all.\n\n`
      if (itineraryUrl) t += `View your itinerary: ${itineraryUrl}\n\n`
      return t + 'Warm regards,\nThe LankaLux Team'
    },
  },
  {
    id: 'gentle_reminder',
    name: 'Gentle reminder',
    subject: 'Your Sri Lanka trip – we’re here when you’re ready',
    getHtml: ({ clientName, itineraryUrl }) => {
      const firstName = clientName?.split(' ')[0] || 'there'
      const buttonUrl = itineraryUrl || `${BASE_URL}`
      const buttonText = itineraryUrl ? 'See my itinerary' : 'Visit LankaLux'
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
      <div class="greeting">Hi ${firstName},</div>
      <p class="body-text">
        I know life gets busy, so I didn’t want to add to the noise—just a gentle reminder that your Sri Lanka itinerary is ready whenever you are.
      </p>
      <p class="body-text">
        Take your time. When you’re ready to take the next step or have any questions, we’re only an email away. No pressure at all.
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
    getText: ({ clientName, itineraryUrl }) => {
      const firstName = clientName?.split(' ')[0] || 'there'
      let t = `Hi ${firstName},\n\nI know life gets busy, so I didn't want to add to the noise—just a gentle reminder that your Sri Lanka itinerary is ready whenever you are.\n\nTake your time. When you're ready to take the next step or have any questions, we're only an email away.\n\n`
      if (itineraryUrl) t += `See your itinerary: ${itineraryUrl}\n\n`
      return t + 'Warm regards,\nThe LankaLux Team'
    },
  },
  {
    id: 'here_when_ready',
    name: "We're here when you're ready",
    subject: 'Whenever you’re ready – your LankaLux itinerary',
    getHtml: ({ clientName, itineraryUrl }) => {
      const firstName = clientName?.split(' ')[0] || 'there'
      const buttonUrl = itineraryUrl || `${BASE_URL}`
      const buttonText = itineraryUrl ? 'Open my itinerary' : 'Get in touch'
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
      <div class="greeting">Hi ${firstName},</div>
      <p class="body-text">
        Just a short note to say we’re here whenever you’d like to chat, tweak your plans, or simply look through your itinerary again. There’s no deadline—we’re happy to help whenever it suits you.
      </p>
      <p class="body-text">
        If anything catches your eye or you have questions, hit reply. We’d love to hear from you.
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
    getText: ({ clientName, itineraryUrl }) => {
      const firstName = clientName?.split(' ')[0] || 'there'
      let t = `Hi ${firstName},\n\nJust a short note to say we're here whenever you'd like to chat, tweak your plans, or simply look through your itinerary again. There's no deadline—we're happy to help whenever it suits you.\n\nIf anything catches your eye or you have questions, hit reply. We'd love to hear from you.\n\n`
      if (itineraryUrl) t += `Open your itinerary: ${itineraryUrl}\n\n`
      return t + 'Warm regards,\nThe LankaLux Team'
    },
  },
]

export function getTemplate(id: TemplateId): TemplateConfig | undefined {
  return FOLLOW_UP_TEMPLATES.find((t) => t.id === id)
}
