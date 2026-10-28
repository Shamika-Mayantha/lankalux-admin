import { AppError, getServiceClient } from '@/services/supabase.server'
import type { Staff } from '@/services/staff.service'

/**
 * Claude bots: Claude scheduled tasks that run on the owner's Claude subscription (not the
 * agent VM). Their schedules live in Claude; each run writes a row to claude_bot_runs, which the
 * AI page shows. Server-only: every caller is a supervisor route.
 */

export type ClaudeBotKey = 'code_review' | 'seo_check' | 'instagram_check' | 'telegram_replies'

export type ClaudeBotRun = {
  id: string
  bot: ClaudeBotKey
  status: 'running' | 'succeeded' | 'failed'
  summary: string
  links: { title: string; url: string }[]
  started_at: string
  finished_at: string | null
}

export type ClaudeBot = { key: ClaudeBotKey; name: string; schedule: string; does: string; runs: ClaudeBotRun[] }

const BOTS: Omit<ClaudeBot, 'runs'>[] = [
  {
    key: 'code_review',
    name: 'Code review',
    schedule: 'Mondays, 8:37am Sri Lanka time',
    does: 'Checks lankalux.com, admin and the guest and chauffeur sites for bugs, security holes, vulnerable packages and slow pages, and opens draft PRs with fixes for you to approve.',
  },
  {
    key: 'seo_check',
    name: 'SEO check',
    schedule: 'Wednesdays, 8:34am Sri Lanka time',
    does: 'Checks lankalux.com titles, descriptions, schema, speed, broken links and the enquiry buttons, compares with competitors, fixes what it safely can in a draft PR and drafts one new page a week.',
  },
  {
    key: 'instagram_check',
    name: 'Social media manager: Instagram check',
    schedule: 'Mondays, 8:43am Sri Lanka time',
    does: "Reads last week's @lanka.lux posts and numbers, notes what worked in the November Instagram plan, and sends the creator up to 3 changes in the content team's Telegram group. It never posts on Instagram.",
  },
  {
    key: 'telegram_replies',
    name: 'Social media manager: Telegram replies',
    schedule: 'Every day, 8:47am and 4:47pm Sri Lanka time',
    does: "Answers the reels creator's questions in the content team's Telegram group, using the Instagram plan. Anything about money, prices or guests comes to you.",
  },
]

export async function listClaudeBots(): Promise<ClaudeBot[]> {
  const { data, error } = await getServiceClient()
    .from('claude_bot_runs')
    .select('id, bot, status, summary, links, started_at, finished_at')
    .order('started_at', { ascending: false })
    .limit(60)
  if (error) throw new Error(`Could not read Claude bot runs: ${error.message}`)
  const runs = ((data || []) as ClaudeBotRun[]).map(settleStale)
  return BOTS.map((b) => ({ ...b, runs: runs.filter((r) => r.bot === b.key).slice(0, 5) }))
}

/** A run that never reported back (Claude was busy or the run broke) stops showing as running. */
const STALE_AFTER_MS = 45 * 60 * 1000

function settleStale(run: ClaudeBotRun): ClaudeBotRun {
  if (run.status !== 'running' || Date.now() - Date.parse(run.started_at) < STALE_AFTER_MS) return run
  return { ...run, status: 'failed', summary: run.summary ? `${run.summary} No report came back from Claude.` : 'No report came back from Claude.' }
}

/**
 * "Ask Claude now" for the Telegram replies bot. Starts its Claude scheduled task through the task's
 * API trigger. The token lives only in the server env (CLAUDE_TELEGRAM_FIRE_TOKEN) and can do nothing
 * but start that one task. A "running" row is written first so the annex shows the robot at work;
 * the task fills in that same row with its report.
 */
const TELEGRAM_TASK_ID = 'trig_015EpDbTmPazQ1EnAZj4tWCR'
const FIRE_URL = `https://api.anthropic.com/v1/claude_code/routines/${TELEGRAM_TASK_ID}/fire`

export async function askTelegramBot(staff: Staff, input: { postUpdate?: unknown; note?: unknown }): Promise<ClaudeBotRun> {
  const token = process.env.CLAUDE_TELEGRAM_FIRE_TOKEN
  if (!token) throw new AppError('The Telegram bot is not connected to admin yet: CLAUDE_TELEGRAM_FIRE_TOKEN is not set in Vercel.', 503)
  const postUpdate = input.postUpdate === true
  const note = typeof input.note === 'string' ? input.note.trim().slice(0, 1000) : ''

  const db = getServiceClient()
  const { data: busy } = await db
    .from('claude_bot_runs')
    .select('id, started_at')
    .eq('bot', 'telegram_replies')
    .eq('status', 'running')
    .gte('started_at', new Date(Date.now() - STALE_AFTER_MS).toISOString())
    .limit(1)
  if (busy?.length) throw new AppError('Claude is already checking the group. Its report will appear here when it finishes.', 409)

  const asked = postUpdate ? 'Asked to check the group and post an update there.' : 'Asked to check the group and report back.'
  const { data: row, error } = await db
    .from('claude_bot_runs')
    .insert({ bot: 'telegram_replies', status: 'running', summary: note ? `${asked} Your note: ${note}` : asked })
    .select('id, bot, status, summary, links, started_at, finished_at')
    .single()
  if (error || !row) throw new Error(`Could not record the request: ${error?.message}`)

  const text = [
    'Started from the LankaLux admin "Ask Claude now" button (supervisor only).',
    `run_id: ${row.id}`,
    `asked_by: ${staff.email || staff.name}`,
    `post_update_to_group: ${postUpdate ? 'yes' : 'no'}`,
    `note_from_owner: ${note || '(none)'}`,
  ].join('\n')
  let failure = ''
  try {
    const res = await fetch(FIRE_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'anthropic-beta': 'experimental-cc-routine-2026-04-01',
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(20_000),
    })
    if (!res.ok) failure = res.status === 401 || res.status === 403 ? 'Claude refused the token (it may have been regenerated).' : `Claude answered ${res.status}.`
  } catch {
    failure = 'Could not reach Claude.'
  }
  if (failure) {
    await db.from('claude_bot_runs').update({ status: 'failed', summary: `${asked} ${failure}`, finished_at: new Date().toISOString() }).eq('id', row.id)
    throw new AppError(failure, 502)
  }
  return row as ClaudeBotRun
}
