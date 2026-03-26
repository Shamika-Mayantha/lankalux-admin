import { NextResponse } from 'next/server'
import OpenAI from 'openai'

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

function jsonResponse(body: unknown, status = 200) {
  const res = NextResponse.json(body, { status })
  Object.entries(corsHeaders).forEach(([k, v]) => res.headers.set(k, v))
  return res
}

function safeText(x: unknown) {
  return typeof x === 'string' ? x.trim() : ''
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

    const draft = coerceDraft(body?.draft || {})

    const mustAskFields: (keyof DraftLead)[] = ['name', 'email', 'startDate', 'endDate', 'numberOfAdults']

    const system = `You are LankaLux Concierge — warm, luxury, human, and concise.
You help guests plan bespoke Sri Lanka journeys and collect details for a request.

Rules:
- Never mention “AI”, “models”, or internal tools.
- Ask at most ONE question at a time.
- Be natural, premium, and friendly. No pushy sales.
- If the guest is vague, offer 2–3 tasteful options.
- We will only create a CRM request when the guest clicks “Send request”, so do not say you already created it.

Data collection targets (minimum before “Send request” is enabled):
- name, email, start date, end date, number of adults
Optional: WhatsApp, children count + ages, preferences, airline ticket assistance.

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
          missingFields: mustAskFields.filter((k) => (draft as any)[k] == null || String((draft as any)[k]).trim() === ''),
          suggestSendRequest: false,
        },
        200
      )
    }

    const nextDraft = { ...draft, ...coerceDraft(parsed?.draft || {}) }
    const missing = mustAskFields.filter((k) => (nextDraft as any)[k] == null || String((nextDraft as any)[k]).trim() === '')
    const suggestSendRequest = missing.length === 0

    return jsonResponse(
      {
        success: true,
        reply: typeof parsed?.reply === 'string' ? parsed.reply : "Lovely. Tell me a little about your ideal pace — relaxed, balanced, or immersive?",
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

