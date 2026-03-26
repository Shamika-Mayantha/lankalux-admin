import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { CHAT_KNOWLEDGE_SUMMARY } from '@/lib/chat-knowledge'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

type ChatMessage = { role: 'user' | 'assistant'; content: string }

type DraftLead = {
  name?: string | null
  email?: string | null
  whatsapp?: string | null
  startDate?: string | null // YYYY-MM-DD
  endDate?: string | null // YYYY-MM-DD
  numberOfAdults?: number | null
  numberOfChildren?: number | null
  childrenAgesValues?: number[] | null
  message?: string | null
  needAirlineTickets?: boolean | null
  airlineFrom?: string | null
  airlineDates?: string | null
}

function isItineraryIntent(text: string) {
  const t = (text || '').toLowerCase()
  if (!t) return false
  const patterns = [
    'itinerary',
    'itineraries',
    'day by day',
    'day-by-day',
    'plan my trip',
    'create a plan',
    'full plan',
    'detailed plan',
    'travel plan',
    'route for',
  ]
  return patterns.some((p) => t.includes(p))
}

function jsonResponse(body: unknown, status = 200) {
  const res = NextResponse.json(body, { status })
  Object.entries(corsHeaders).forEach(([k, v]) => res.headers.set(k, v))
  return res
}

function safeText(x: unknown) {
  return typeof x === 'string' ? x.trim() : ''
}

function normalizeForCompare(text: string) {
  return (text || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s]/g, '')
    .trim()
}

function extractEmail(text: string) {
  const m = (text || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)
  return m ? m[0].trim() : null
}

function extractWhatsApp(text: string) {
  const m = (text || '').match(/(?:\+?\d[\d\s\-()]{7,}\d)/)
  if (!m) return null
  const cleaned = m[0].replace(/[^\d+]/g, '')
  return cleaned.length >= 8 ? cleaned : null
}

function coerceDraft(d: any): DraftLead {
  const asNum = (v: any) => (typeof v === 'number' ? v : v == null ? null : Number(String(v)))
  const asBool = (v: any) => (typeof v === 'boolean' ? v : v == null ? null : String(v).toLowerCase() === 'true')
  const ages =
    Array.isArray(d?.childrenAgesValues)
      ? d.childrenAgesValues
          .map((x: any) => (typeof x === 'number' ? x : Number(String(x))))
          .filter((n: any) => Number.isFinite(n))
      : null
  return {
    name: d?.name != null ? String(d.name).trim() || null : null,
    email: d?.email != null ? String(d.email).trim() || null : null,
    whatsapp: d?.whatsapp != null ? String(d.whatsapp).trim() || null : null,
    startDate: d?.startDate != null ? String(d.startDate).trim() || null : null,
    endDate: d?.endDate != null ? String(d.endDate).trim() || null : null,
    numberOfAdults: Number.isFinite(asNum(d?.numberOfAdults)) ? (asNum(d?.numberOfAdults) as number) : null,
    numberOfChildren: Number.isFinite(asNum(d?.numberOfChildren)) ? (asNum(d?.numberOfChildren) as number) : null,
    childrenAgesValues: ages && ages.length ? (ages as number[]) : null,
    message: d?.message != null ? String(d.message).trim() || null : null,
    needAirlineTickets: asBool(d?.needAirlineTickets),
    airlineFrom: d?.airlineFrom != null ? String(d.airlineFrom).trim() || null : null,
    airlineDates: d?.airlineDates != null ? String(d.airlineDates).trim() || null : null,
  }
}

export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return jsonResponse({ success: false, error: 'Missing OPENAI_API_KEY' }, 500)
    }

    const body = (await req.json().catch(() => ({}))) as any
    const messagesRaw: unknown = body?.messages
    const messages: ChatMessage[] = Array.isArray(messagesRaw)
      ? (messagesRaw as any[])
          .map((m): ChatMessage => ({
            role: m?.role === 'assistant' ? 'assistant' : 'user',
            content: safeText(m?.content),
          }))
          .filter((m) => m.content.length > 0)
          .slice(-20)
      : []

    let draft = coerceDraft(body?.draft || {})

    const mustAskFields: (keyof DraftLead)[] = ['name', 'startDate', 'endDate', 'numberOfAdults']
    const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user')?.content || ''
    const lastAssistantMessage = [...messages].reverse().find((m) => m.role === 'assistant')?.content || ''

    // Auto-capture contact details if user typed them naturally in chat.
    const inferredEmail = extractEmail(lastUserMessage)
    const inferredWhatsApp = extractWhatsApp(lastUserMessage)
    if (!draft.email && inferredEmail) draft = { ...draft, email: inferredEmail }
    if (!draft.whatsapp && inferredWhatsApp) draft = { ...draft, whatsapp: inferredWhatsApp }

    // Hard guard: do not provide full itinerary generation in chat.
    if (isItineraryIntent(lastUserMessage)) {
      const missing = mustAskFields
        .filter((k) => (draft as any)[k] == null || String((draft as any)[k]).trim() === '')
        .concat(!draft.email && !draft.whatsapp ? (['email_or_whatsapp'] as any) : [])
      return jsonResponse(
        {
          success: true,
          reply:
            "I can help with general guidance on our journeys, vehicles, and services. For full personalized itineraries, our team prepares those directly for you.\n\nPlease tap 'Send request' and we will design your itinerary personally.",
          draft,
          missingFields: missing,
          suggestSendRequest: true,
        },
        200
      )
    }

    // Contact gate: do not proceed with normal conversation before collecting at least
    // one reliable contact method (email or WhatsApp).
    if (!draft.email && !draft.whatsapp) {
      const missing = mustAskFields
        .filter((k) => (draft as any)[k] == null || String((draft as any)[k]).trim() === '')
        .concat(!draft.email && !draft.whatsapp ? (['email_or_whatsapp'] as any) : [])
      return jsonResponse(
        {
          success: true,
          reply:
            "Before we continue, may I have your email address or WhatsApp number so our travel specialist can follow up personally?",
          draft,
          missingFields: missing,
          suggestSendRequest: false,
        },
        200
      )
    }

    const system = `You are LankaLux Live Chat — warm, luxury, human, and concise.
You help guests plan bespoke Sri Lanka journeys and collect details for a request.

Rules:
- Never mention “AI”, “models”, or internal tools.
- Ask at most ONE question at a time.
- Ask for the guest's name first (if missing), so you can address them properly in follow-ups.
- Be natural, premium, and friendly. No pushy sales.
- If the guest is vague, offer 2–3 tasteful options.
- We will only create a CRM request when the guest clicks “Send request”, so do not say you already created it.
- IMPORTANT: Do NOT generate full or day-by-day itineraries in chat.
- If asked for an itinerary, politely explain that full personalized itineraries are prepared directly by the LankaLux team after request submission.
- Scope in chat: general questions only (vehicles, journey styles, services, process, what is included, response timelines).
- If unsure about a detail, say you will have the team confirm instead of guessing.
- Keep asking until at least one contact is captured (email OR WhatsApp) before proceeding into longer guidance.

Data collection targets (minimum before “Send request” is enabled):
- name, start date, end date, number of adults, and at least one contact method (email or WhatsApp)
Optional: remaining contact method, children count + ages, preferences, airline ticket assistance.

Knowledge base:
${CHAT_KNOWLEDGE_SUMMARY}

Output STRICT JSON only with this shape:
{
  "reply": "string",
  "draft": { ...updated fields... },
  "missingFields": ["name","email",...],
  "suggestSendRequest": true|false
}`

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini',
      temperature: 0.6,
      messages: [
        { role: 'system', content: system },
        {
          role: 'user',
          content: JSON.stringify({
            currentDraft: draft,
            mustAskFields,
            conversation: messages,
          }),
        },
      ],
    })

    const text = completion.choices?.[0]?.message?.content || ''
    let parsed: any = null
    try {
      parsed = JSON.parse(text)
    } catch {
      // Fallback: if JSON parsing fails, return a safe message.
      return jsonResponse(
        {
          success: true,
          reply:
            "Thanks — I’m here. To get started, what dates are you considering for Sri Lanka, and how many adults will be travelling?",
          draft,
          missingFields: mustAskFields
            .filter((k) => (draft as any)[k] == null || String((draft as any)[k]).trim() === '')
            .concat(!draft.email && !draft.whatsapp ? (['email_or_whatsapp'] as any) : []),
          suggestSendRequest: false,
        },
        200
      )
    }

    const nextDraft = { ...draft, ...coerceDraft(parsed?.draft || {}) }
    const missing = mustAskFields
      .filter((k) => (nextDraft as any)[k] == null || String((nextDraft as any)[k]).trim() === '')
      .concat(!nextDraft.email && !nextDraft.whatsapp ? (['email_or_whatsapp'] as any) : [])
    const suggestSendRequest = missing.length === 0

    let reply =
      typeof parsed?.reply === 'string'
        ? parsed.reply
        : "Lovely. Tell me a little about your ideal pace — relaxed, balanced, or immersive?"

    // Anti-repeat guard: if the response matches the previous assistant message, pivot to a
    // new, specific follow-up so the chat does not feel stuck.
    if (normalizeForCompare(reply) && normalizeForCompare(reply) === normalizeForCompare(lastAssistantMessage)) {
      if (!nextDraft.name) {
        reply = "May I have your name first, so I can address you properly?"
      } else if (!nextDraft.startDate || !nextDraft.endDate) {
        reply = `Lovely${nextDraft.name ? ', ' + nextDraft.name : ''}. What travel dates are you considering?`
      } else if (nextDraft.numberOfAdults == null) {
        reply = `Great${nextDraft.name ? ', ' + nextDraft.name : ''}. How many adults will be travelling?`
      } else {
        reply =
          "Thank you. I can also share a quick overview of our vehicle options and services, or you can tap 'Send request' and our team will take it from here."
      }
    }

    return jsonResponse(
      {
        success: true,
        reply,
        draft: nextDraft,
        missingFields: Array.isArray(parsed?.missingFields) ? parsed.missingFields : missing,
        suggestSendRequest,
      },
      200
    )
  } catch (err) {
    return jsonResponse({ success: false, error: err instanceof Error ? err.message : 'Unknown error' }, 500)
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders })
}

