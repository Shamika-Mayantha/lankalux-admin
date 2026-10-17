-- Website Concierge: the chat on lankalux.com, rebuilt as an agent in the AI system.
--
-- It answers in real time from admin (/api/concierge), not from the agent service, so it
-- runs even while the agent service is paused. Its conversations live with the WhatsApp
-- ones (channel 'website') and the owner pauses it or takes a chat over on the AI page.
-- The trip details it collects are kept on the conversation until they become a request.
-- Additive. Rollback: DELETE FROM ai_conversations WHERE channel = 'website'; restore the
-- old channel check; ALTER TABLE ai_conversations DROP COLUMN lead; DELETE the agent row.

ALTER TABLE public.ai_conversations DROP CONSTRAINT IF EXISTS ai_conversations_channel_check;
ALTER TABLE public.ai_conversations
  ADD CONSTRAINT ai_conversations_channel_check CHECK (channel IN ('whatsapp', 'email', 'owner', 'website'));

ALTER TABLE public.ai_conversations ADD COLUMN IF NOT EXISTS lead jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.ai_agents DROP CONSTRAINT IF EXISTS ai_agents_key_check;
ALTER TABLE public.ai_agents
  ADD CONSTRAINT ai_agents_key_check
  CHECK (key IN ('manager', 'sales', 'planner', 'pricing', 'followup', 'operations', 'quality', 'concierge'));

INSERT INTO public.ai_agents (key, name, description) VALUES
  ('concierge', 'Website Concierge',
   'Answers visitors in the chat on lankalux.com, takes their trip details and passes them to the team as a new request. Tailored itineraries go to email or WhatsApp.')
ON CONFLICT (key) DO NOTHING;
