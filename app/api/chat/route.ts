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

function countUserMessages(msgs: ChatMessage[]) {
  return msgs.filter((m) => m.role === 'user').length
}

function recentAssistantContents(msgs: ChatMessage[], n: number) {
  return msgs
    .filter((m) => m.role === 'assistant')
    .slice(-n)
    .map((m) => m.content)
}

function isDuplicateAssistantReply(reply: string, msgs: ChatMessage[]) {
  const r = normalizeForCompare(reply)
  if (!r) return false
  return recentAssistantContents(msgs, 4).some((prev) => normalizeForCompare(prev) === r)
}

function wantsToEndChatWithoutContact(text: string) {
  const t = (text || '').toLowerCase().trim()
  if (!t) return false
  if (/\bend\s*chat\b/.test(t)) return true
  return /\b(end|stop|quit|leave|bye|goodbye|no thanks|not now|skip|cancel|never mind|nevermind)\b/.test(t)
}

function nameFirstReply(turnSeed: number): string {
  const lines = [
    "Welcome — I'm really glad you're here.\n\nWhen you have a moment, what may I call you? It keeps things feeling personal. If you'd rather not say, no problem — just tell me what you're curious about for Sri Lanka and we'll take it from there.",
    "Lovely to hear from you.\n\nMay I ask your first name? Only if you're comfortable — otherwise, feel free to share what you're imagining for your journey and we'll ease into the details together.",
    "Thank you for reaching out.\n\nI'd love to address you properly — what should I call you? And if you'd rather jump straight into dates or ideas, I'm listening.",
  ]
  return lines[Math.abs(turnSeed) % lines.length]
}

function contactGateReply(userTurns: number): string {
  // userTurns = number of user messages in this session (stages the wording so we never paste the same line repeatedly).
  if (userTurns <= 2) {
    return 'When you have a quiet moment, could you share either an email or a WhatsApp number? Either works — it simply lets our team follow up thoughtfully.'
  }
  if (userTurns === 3) {
    return 'To go a little deeper, I would need one way to reach you — email or WhatsApp, whichever you prefer.'
  }
  if (userTurns === 4) {
    return 'I still need one contact detail — email or WhatsApp — so the team can reach you. Which feels easier?'
  }
  return 'If you would rather not share contact details here, that is completely fine — tap **End chat** below to close whenever you like. If you change your mind, just send an email or WhatsApp number and we will take it from there.'
}

function itineraryGuardReply(userTurns: number): string {
  if (userTurns <= 1) {
    return "I can help with general guidance on our journeys, vehicles, and services. For full personalized itineraries, our team prepares those directly for you.\n\nPlease tap 'Send request' and we will design your itinerary personally."
  }
  if (userTurns === 2) {
    return "For a detailed day-by-day itinerary, our specialists prepare that after you submit a request — tap **Send request** when you are ready.\n\nIf something is unclear, tell me in one sentence what you are hoping to see or do in Sri Lanka."
  }
  return "I am not able to draft a full itinerary in this chat, but our team can — use **Send request** with your details.\n\nYou can also tap **End chat** below if you would like to stop for now."
}

const NAME_GREETING_WORDS = new Set([
  'hello',
  'hi',
  'hey',
  'thanks',
  'thank',
  'yes',
  'no',
  'ok',
  'okay',
  'sure',
  'please',
  'help',
])

function extractNameFromMessage(text: string): string | null {
  const raw = (text || '').trim()
  if (!raw || raw.length > 90) return null
  const lower = raw.toLowerCase()
  if (/\b(skip|prefer not|no name|anonymous|rather not|pass)\b/.test(lower)) return null
  const m1 = raw.match(
    /^(?:i'?m|i am|my name is|this is|call me|it's|its)\s+([A-Za-z][A-Za-z'.-]*(?:\s+[A-Za-z][A-Za-z'.-]*){0,3})\s*\.?$/i
  )
  if (m1) return m1[1].trim().split(/\s+/).slice(0, 4).join(' ')
  const words = raw.split(/\s+/).filter(Boolean)
  if (words.length >= 1 && words.length <= 3 && raw.length <= 42) {
    const w0 = words[0].toLowerCase()
    if (words.length === 1 && NAME_GREETING_WORDS.has(w0)) return null
    if (words.every((w) => /^[A-Za-z][A-Za-z'.-]*$/.test(w))) return raw
  }
  return null
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

    // Name is preferred for tone but does not block "Send request" — only dates, adults, and contact do.
    const mustAskFields: (keyof DraftLead)[] = ['startDate', 'endDate', 'numberOfAdults']
    const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user')?.content || ''
    const lastAssistantMessage = [...messages].reverse().find((m) => m.role === 'assistant')?.content || ''

    // Auto-capture contact details if user typed them naturally in chat.
    const inferredEmail = extractEmail(lastUserMessage)
    const inferredWhatsApp = extractWhatsApp(lastUserMessage)
    if (!draft.email && inferredEmail) draft = { ...draft, email: inferredEmail }
    if (!draft.whatsapp && inferredWhatsApp) draft = { ...draft, whatsapp: inferredWhatsApp }
    if (!draft.name) {
      const inferredName = extractNameFromMessage(lastUserMessage)
      if (inferredName) draft = { ...draft, name: inferredName }
    }

    const userTurns = countUserMessages(messages)
    const lastAssistantNorm = normalizeForCompare(lastAssistantMessage)

    // First turn: gently ask for a name before contact or deeper topics (if not inferred).
    if (!draft.email && !draft.whatsapp && userTurns === 1 && !draft.name) {
      const missing = mustAskFields
        .filter((k) => (draft as any)[k] == null || String((draft as any)[k]).trim() === '')
        .concat(['email_or_whatsapp'] as any)
      let reply = nameFirstReply(userTurns + lastUserMessage.length)
      if (normalizeForCompare(reply) === lastAssistantNorm) {
        reply = nameFirstReply(userTurns + 3)
      }
      return jsonResponse(
        {
          success: true,
          reply,
          draft,
          missingFields: missing,
          suggestSendRequest: false,
        },
        200
      )
    }

    // Guest wants to stop without sharing contact — do not loop the same contact prompt.
    if (!draft.email && !draft.whatsapp && wantsToEndChatWithoutContact(lastUserMessage)) {
      const missing = mustAskFields
        .filter((k) => (draft as any)[k] == null || String((draft as any)[k]).trim() === '')
        .concat(['email_or_whatsapp'] as any)
      return jsonResponse(
        {
          success: true,
          reply:
            'Understood. Whenever you are ready, tap **End chat** below to close — no obligation. If you would like help later, you can open chat again anytime.',
          draft,
          missingFields: missing,
          suggestSendRequest: false,
        },
        200
      )
    }

    // Hard guard: do not provide full itinerary generation in chat.
    if (isItineraryIntent(lastUserMessage)) {
      const missing = mustAskFields
        .filter((k) => (draft as any)[k] == null || String((draft as any)[k]).trim() === '')
        .concat(!draft.email && !draft.whatsapp ? (['email_or_whatsapp'] as any) : [])
      let reply = itineraryGuardReply(userTurns)
      if (normalizeForCompare(reply) === lastAssistantNorm) {
        reply = itineraryGuardReply(userTurns + 1)
      }
      return jsonResponse(
        {
          success: true,
          reply,
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
      let reply = contactGateReply(userTurns)
      if (normalizeForCompare(reply) === lastAssistantNorm) {
        reply = contactGateReply(userTurns + 1)
      }
      return jsonResponse(
        {
          success: true,
          reply,
          draft,
          missingFields: missing,
          suggestSendRequest: false,
        },
        200
      )
    }

    const system = `You are LankaLux Live Chat — warm, unhurried, and human. You help guests plan bespoke Sri Lanka journeys.

Voice:
- Sound like a thoughtful travel host, not a form. A short soft line before a question is welcome (e.g. acknowledge their mood or question).
- Never mention “AI”, “models”, or internal tools.
- Ask at most ONE clear question at a time.
- If you know their name from the draft, use it sparingly and naturally — never every sentence.
- If they never shared a name, do not nag. Address them in a neutral, warm way (“you”) and move on.
- Avoid sounding like a checklist. Vary sentence shape; do not open every reply the same way.
- If they are vague, offer 2–3 gentle options or a simple either/or.
- We only create a CRM request when they tap “Send request” — never say it is already created.
- Do NOT generate full or day-by-day itineraries in chat; explain that tailored itineraries are prepared by the team after request submission.
- Scope: journeys, vehicles, services, process, timelines — not rigid scripts.
- If unsure, say the team will confirm rather than guessing.
- At least one contact method (email OR WhatsApp) is required before long bespoke planning; name is optional but lovely when offered.

Data for “Send request” (name optional): start date, end date, number of adults, plus email OR WhatsApp.
Optional: name, children, preferences, airline help.

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
      temperature: 0.72,
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
            "I'm here with you. When you picture this trip, are you leaning toward something slow and restorative, or a bit more full of discovery? And roughly what dates feel right?",
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
        : "I'd love to understand the rhythm you're after — more unhurried days, or a fuller sense of discovery?"

    // Anti-repeat guard: if the response matches the previous assistant message, pivot to a
    // new, specific follow-up so the chat does not feel stuck.
    if (normalizeForCompare(reply) && isDuplicateAssistantReply(reply, messages)) {
      if (!nextDraft.startDate || !nextDraft.endDate) {
        reply = nextDraft.name
          ? `Whenever it suits you${', ' + nextDraft.name}, what stretch of dates are you imagining?`
          : 'What stretch of dates are you imagining for Sri Lanka — even a rough month helps.'
      } else if (nextDraft.numberOfAdults == null) {
        reply = nextDraft.name
          ? `Lovely — how many adults should I have in mind, ${nextDraft.name}?`
          : 'How many adults should I have in mind for this?'
      } else {
        reply =
          "Whenever you're ready, I can sketch vehicles and how we usually work — or you can tap **Send request** and the team will shape it with you."
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

