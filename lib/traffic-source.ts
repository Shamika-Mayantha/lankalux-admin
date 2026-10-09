/** Turn the website's visit attribution into one readable line, e.g. "Google search · landed on /destinations/yala · enquired on /". */

const SEARCH: Array<[RegExp, string]> = [
  [/(^|\.)google\./, 'Google search'],
  [/(^|\.)bing\.com$/, 'Bing search'],
  [/(^|\.)duckduckgo\.com$/, 'DuckDuckGo search'],
  [/(^|\.)yahoo\./, 'Yahoo search'],
  [/(^|\.)ecosia\.org$/, 'Ecosia search'],
  [/(^|\.)instagram\.com$/, 'Instagram'],
  [/(^|\.)facebook\.com$|^fb\.me$/, 'Facebook'],
  [/(^|\.)tripadvisor\./, 'Tripadvisor'],
  [/(^|\.)(chatgpt\.com|openai\.com)$/, 'ChatGPT'],
  [/(^|\.)perplexity\.ai$/, 'Perplexity'],
  [/(^|\.)(t\.co|twitter\.com|x\.com)$/, 'X (Twitter)'],
  [/(^|\.)linkedin\.com$|^lnkd\.in$/, 'LinkedIn'],
  [/(^|\.)youtube\.com$/, 'YouTube'],
]

function clean(value: unknown, max: number): string {
  if (typeof value !== 'string') return ''
  return value.replace(/[\u0000-\u001f]/g, '').trim().slice(0, max)
}

function page(value: unknown): string {
  const p = clean(value, 200)
  return p.startsWith('/') ? p : ''
}

export function describeTrafficSource(attribution: unknown): string | null {
  if (!attribution || typeof attribution !== 'object') return null
  const a = attribution as Record<string, unknown>
  const referrer = clean(a.referrer, 120).toLowerCase()
  const utmSource = clean(a.utmSource, 80)
  const utmMedium = clean(a.utmMedium, 80)
  const utmCampaign = clean(a.utmCampaign, 120)
  const landing = page(a.landingPage)
  const enquiry = page(a.enquiryPage)

  let channel = ''
  if (utmSource) {
    channel = utmSource + (utmMedium ? ` / ${utmMedium}` : '') + (utmCampaign ? ` (${utmCampaign})` : '')
  } else if (referrer) {
    channel = SEARCH.find(([re]) => re.test(referrer))?.[1] || referrer
  } else if (landing || enquiry) {
    channel = 'Direct or unknown'
  }
  if (!channel) return null

  const parts = [channel]
  if (landing) parts.push(`landed on ${landing}`)
  if (enquiry && enquiry !== landing) parts.push(`enquired on ${enquiry}`)
  return parts.join(' · ')
}
