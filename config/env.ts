/**
 * Server-side env access. Never import this file from client components.
 * Values are never returned to the browser except via the settings status flags.
 */

export type EnvStatus = 'configured' | 'missing'

function present(name: string): boolean {
  const v = process.env[name]
  return typeof v === 'string' && v.trim().length > 0
}

export function smtpPassword(): string | undefined {
  return process.env.SMTP_PASS || process.env.SMTP_PASSWORD
}

export function appUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.replace(/^/, 'https://') ||
    'https://admin.lankalux.com'
  ).replace(/\/$/, '')
}

export function openaiModel(): string {
  return process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini'
}

export function envFlags(): Record<string, EnvStatus> {
  return {
    NEXT_PUBLIC_SUPABASE_URL: present('NEXT_PUBLIC_SUPABASE_URL') ? 'configured' : 'missing',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: present('NEXT_PUBLIC_SUPABASE_ANON_KEY') ? 'configured' : 'missing',
    SUPABASE_SERVICE_ROLE_KEY: present('SUPABASE_SERVICE_ROLE_KEY') ? 'configured' : 'missing',
    OPENAI_API_KEY: present('OPENAI_API_KEY') ? 'configured' : 'missing',
    SMTP_HOST: present('SMTP_HOST') ? 'configured' : 'missing',
    SMTP_USER: present('SMTP_USER') ? 'configured' : 'missing',
    SMTP_PASS: smtpPassword() ? 'configured' : 'missing',
    SMTP_FROM: present('SMTP_FROM') || present('SMTP_USER') ? 'configured' : 'missing',
  }
}

export function requireServerSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url) throw new Error('Supabase request failed: NEXT_PUBLIC_SUPABASE_URL is not configured.')
  if (!key) throw new Error('Supabase request failed: SUPABASE_SERVICE_ROLE_KEY is not configured.')
  return { url, key }
}

export function requireOpenAiKey() {
  const key = process.env.OPENAI_API_KEY
  if (!key) throw new Error('AI request failed: OPENAI_API_KEY is not configured.')
  return key
}

export function requireSmtp() {
  const host = process.env.SMTP_HOST
  const user = process.env.SMTP_USER
  const pass = smtpPassword()
  const port = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587
  const from = process.env.SMTP_FROM || user
  if (!host || !user || !pass) {
    throw new Error('Email API is not configured. SMTP_HOST, SMTP_USER and SMTP_PASS are required.')
  }
  return { host, user, pass, port, from: from || user }
}
