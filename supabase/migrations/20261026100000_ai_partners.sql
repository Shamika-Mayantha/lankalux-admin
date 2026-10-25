-- Partner outreach (B2B): travel agents, honeymoon and wedding planners and tour operators abroad
-- who sell Sri Lanka but do not run their own ground transport there. The owner adds their websites
-- on the AI page; the Partner agent reads only each site's public pages (where robots.txt allows),
-- finds the published business email, judges the fit and drafts an introduction. At most 5 a day are
-- proposed, each a Level 3 message.partner_intro that goes out only when the owner approves it, with
-- an opt-out link (ai_email_optouts, enforced by ai_begin_action()). One introduction per business.
--
-- The agent role may read the list and fill in its own research while a row is new; adding sites,
-- marking replies and "not a fit" come from the console, and "emailed" from the dispatcher.
-- Additive and idempotent.
-- Rollback: DROP TABLE public.ai_partners; DELETE FROM public.ai_action_policies WHERE action_type = 'message.partner_intro';
--   DELETE FROM public.ai_tasks WHERE agent_key = 'partners'; DELETE FROM public.ai_agents WHERE key = 'partners';
--   restore ai_agents_key_check from 20261026000000_ai_win_back.sql.

BEGIN;

ALTER TABLE public.ai_agents DROP CONSTRAINT IF EXISTS ai_agents_key_check;
ALTER TABLE public.ai_agents
  ADD CONSTRAINT ai_agents_key_check
  CHECK (key IN ('manager', 'sales', 'planner', 'pricing', 'followup', 'operations', 'quality', 'concierge', 'scout',
                 'winback', 'partners'));

INSERT INTO public.ai_agents (key, name, description) VALUES
  ('partners', 'Partner outreach',
   'Reads the public websites of travel agents and planners abroad that you add, checks they could use a ground partner in Sri Lanka, and drafts an introduction email. At most 5 a day, each approved by you, with an opt-out link.')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.ai_action_policies (action_type, level, customer_facing, description) VALUES
  ('message.partner_intro', 3, true, 'Introduction email to a travel business abroad (owner approves each one).')
ON CONFLICT (action_type) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.ai_partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  website text NOT NULL UNIQUE CHECK (website ~ '^https?://[^/]+$'),   -- the site's origin, the dedupe key
  -- Filled in by the agent from the site's public pages.
  name text,
  country text,
  kind text CHECK (kind IN ('travel_agent', 'honeymoon_planner', 'wedding_planner', 'tour_operator', 'other')),
  contact_email text CHECK (contact_email IS NULL OR contact_email = lower(btrim(contact_email))),
  contact_page text,
  score smallint CHECK (score BETWEEN 0 AND 100),
  summary text,
  reason text,
  draft_subject text,
  draft_body text,
  quality_notes jsonb NOT NULL DEFAULT '[]'::jsonb,
  researched_at timestamptz,
  error text,
  status text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'researched', 'not_fit', 'failed', 'drafted', 'emailed', 'replied')),
  action_id uuid REFERENCES public.ai_actions(id) ON DELETE SET NULL,
  added_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_partners_status_idx ON public.ai_partners (status, score DESC NULLS LAST);

CREATE OR REPLACE TRIGGER ai_partners_touch BEFORE UPDATE ON public.ai_partners
  FOR EACH ROW EXECUTE FUNCTION public.ai_touch_updated_at();

ALTER TABLE public.ai_partners ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_partners FROM anon, authenticated;
GRANT SELECT ON public.ai_partners TO authenticated;
DROP POLICY IF EXISTS "Supervisors read ai_partners" ON public.ai_partners;
CREATE POLICY "Supervisors read ai_partners" ON public.ai_partners FOR SELECT TO authenticated USING (public.is_lankalux_admin());

GRANT SELECT ON public.ai_partners TO lankalux_agent;
GRANT UPDATE (name, country, kind, contact_email, contact_page, score, summary, reason, draft_subject, draft_body,
              quality_notes, researched_at, error, status, action_id) ON public.ai_partners TO lankalux_agent;
DROP POLICY IF EXISTS "Agent service reads ai_partners" ON public.ai_partners;
CREATE POLICY "Agent service reads ai_partners" ON public.ai_partners FOR SELECT TO lankalux_agent USING (true);
-- Research a new (or failed) site, and mark a researched one drafted once its email is proposed. Never emailed or replied.
DROP POLICY IF EXISTS "Agent service researches partners" ON public.ai_partners;
CREATE POLICY "Agent service researches partners" ON public.ai_partners FOR UPDATE TO lankalux_agent
  USING (status IN ('new', 'failed', 'researched'))
  WITH CHECK (status IN ('researched', 'not_fit', 'failed', 'drafted'));

COMMIT;
