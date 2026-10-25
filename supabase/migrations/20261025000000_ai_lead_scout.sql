-- Lead Scout: finds public posts from people planning a Sri Lanka trip and drafts a helpful reply.
--
-- The agent service reads public posts (Reddit's official API, and public RSS feeds the owner lists
-- that robots.txt allows), keeps them in ai_leads, and the local model scores each one and drafts a
-- reply. Nothing is posted or emailed by the system: the owner replies from the LankaLux account and
-- marks the lead on the AI page. So the agent role may only add leads and fill in its own reading
-- of a lead that is still new; status changes and "create request" come from the console (service role).
-- Additive and idempotent.
-- Rollback: DROP TABLE public.ai_leads; DELETE FROM public.ai_tasks WHERE agent_key = 'scout';
--   DELETE FROM public.ai_agents WHERE key = 'scout'; restore ai_agents_key_check from
--   20261017100000_website_concierge.sql.

BEGIN;

ALTER TABLE public.ai_agents DROP CONSTRAINT IF EXISTS ai_agents_key_check;
ALTER TABLE public.ai_agents
  ADD CONSTRAINT ai_agents_key_check
  CHECK (key IN ('manager', 'sales', 'planner', 'pricing', 'followup', 'operations', 'quality', 'concierge', 'scout'));

INSERT INTO public.ai_agents (key, name, description) VALUES
  ('scout', 'Lead Scout',
   'Twice a day reads public posts from people planning a Sri Lanka trip, scores them and drafts a helpful reply for you to post from the LankaLux account. It never posts or emails anyone.')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.ai_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL CHECK (source IN ('reddit', 'feed')),
  source_detail text,                      -- "r/srilanka", or the feed's site
  url text NOT NULL UNIQUE,                -- dedupe key
  title text NOT NULL DEFAULT '',
  author text,                             -- public handle only
  posted_at timestamptz,
  excerpt text NOT NULL DEFAULT '' CHECK (length(excerpt) <= 4000),
  -- Filled in by the model; NULL score means not read yet.
  score smallint CHECK (score BETWEEN 0 AND 100),
  summary text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,   -- dates, party, places, budget, interests
  draft_reply text,
  reason text,
  quality_notes jsonb NOT NULL DEFAULT '[]'::jsonb,
  judged_at timestamptz,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'replied', 'not_relevant', 'converted')),
  request_id text,
  handled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  handled_at timestamptz,
  found_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_leads_open_idx ON public.ai_leads (score DESC NULLS LAST, found_at DESC) WHERE status = 'new';
CREATE INDEX IF NOT EXISTS ai_leads_found_idx ON public.ai_leads (found_at DESC);

CREATE OR REPLACE TRIGGER ai_leads_touch BEFORE UPDATE ON public.ai_leads
  FOR EACH ROW EXECUTE FUNCTION public.ai_touch_updated_at();

ALTER TABLE public.ai_leads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_leads FROM anon, authenticated;
GRANT SELECT ON public.ai_leads TO authenticated;
DROP POLICY IF EXISTS "Supervisors read ai_leads" ON public.ai_leads;
CREATE POLICY "Supervisors read ai_leads" ON public.ai_leads FOR SELECT TO authenticated USING (public.is_lankalux_admin());

GRANT SELECT, INSERT ON public.ai_leads TO lankalux_agent;
GRANT UPDATE (score, summary, details, draft_reply, reason, quality_notes, judged_at) ON public.ai_leads TO lankalux_agent;
DROP POLICY IF EXISTS "Agent service reads ai_leads" ON public.ai_leads;
CREATE POLICY "Agent service reads ai_leads" ON public.ai_leads FOR SELECT TO lankalux_agent USING (true);
-- New leads only, never already handled or linked to a request.
DROP POLICY IF EXISTS "Agent service adds leads" ON public.ai_leads;
CREATE POLICY "Agent service adds leads" ON public.ai_leads FOR INSERT TO lankalux_agent
  WITH CHECK (status = 'new' AND request_id IS NULL AND handled_by IS NULL AND handled_at IS NULL);
-- Its reading of a lead, while the owner has not dealt with it yet.
DROP POLICY IF EXISTS "Agent service judges leads" ON public.ai_leads;
CREATE POLICY "Agent service judges leads" ON public.ai_leads FOR UPDATE TO lankalux_agent
  USING (status = 'new') WITH CHECK (status = 'new');

COMMIT;
