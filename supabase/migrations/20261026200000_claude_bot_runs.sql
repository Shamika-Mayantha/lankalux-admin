-- Claude bots: the Claude scheduled tasks (code review, SEO check, Instagram check, Telegram replies, Bellion) that run
-- on the owner's Claude subscription, outside the agent VM. Each run records what it did here, and the
-- AI page shows them in a "Claude bots" tab. Only Claude's own session writes rows (as the database
-- owner, through the Supabase connector); supervisors read them. The agent role has no access.
-- Additive and idempotent. Rollback: DROP TABLE public.claude_bot_runs;

CREATE TABLE IF NOT EXISTS public.claude_bot_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bot text NOT NULL CHECK (bot IN ('code_review', 'seo_check', 'instagram_check', 'telegram_replies', 'bellion')),
  status text NOT NULL DEFAULT 'succeeded' CHECK (status IN ('running', 'succeeded', 'failed')),
  summary text NOT NULL DEFAULT '',
  links jsonb NOT NULL DEFAULT '[]'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE INDEX IF NOT EXISTS claude_bot_runs_bot_idx ON public.claude_bot_runs (bot, started_at DESC);

ALTER TABLE public.claude_bot_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Supervisors read claude_bot_runs" ON public.claude_bot_runs;
CREATE POLICY "Supervisors read claude_bot_runs" ON public.claude_bot_runs FOR SELECT TO authenticated USING (public.is_lankalux_admin());
