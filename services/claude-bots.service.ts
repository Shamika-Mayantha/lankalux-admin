import { getServiceClient } from '@/services/supabase.server'

/**
 * Claude bots: Claude scheduled tasks that run on the owner's Claude subscription (not the
 * agent VM). Their schedules live in Claude; each run writes a row to claude_bot_runs, which the
 * AI page shows. Server-only: every caller is a supervisor route.
 */

export type ClaudeBotKey = 'code_review' | 'seo_check' | 'instagram_check' | 'telegram_replies' | 'bellion'

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
  {
    key: 'bellion',
    name: 'Bellion',
    schedule: 'Three times a day (Riga time 8:46am, 1:46pm, 7:46pm)',
    does: 'Finds new enquiries, client replies and follow-ups that need you, and leaves ready-to-send email drafts on the requests. It never sends anything.',
  },
]

export async function listClaudeBots(): Promise<ClaudeBot[]> {
  const { data, error } = await getServiceClient()
    .from('claude_bot_runs')
    .select('id, bot, status, summary, links, started_at, finished_at')
    .order('started_at', { ascending: false })
    .limit(60)
  if (error) throw new Error(`Could not read Claude bot runs: ${error.message}`)
  const runs = (data || []) as ClaudeBotRun[]
  return BOTS.map((b) => ({ ...b, runs: runs.filter((r) => r.bot === b.key).slice(0, 5) }))
}
