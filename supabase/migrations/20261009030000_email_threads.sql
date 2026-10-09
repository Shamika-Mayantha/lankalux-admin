-- Two-way email per request: outgoing mail records who sent it and from which address,
-- and client replies (received through Resend at reply.lankalux.com) are stored as
-- inbound rows on the same request. Access stays as before: the console reads these
-- rows through server routes that check request access, and RLS on communications
-- (admin_only_rls) keeps them away from the anon and guest roles.

ALTER TABLE public.communications
  ADD COLUMN IF NOT EXISTS direction text NOT NULL DEFAULT 'outbound',
  ADD COLUMN IF NOT EXISTS from_address text,
  ADD COLUMN IF NOT EXISTS sent_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS message_id text;

ALTER TABLE public.communications DROP CONSTRAINT IF EXISTS communications_direction_check;
ALTER TABLE public.communications
  ADD CONSTRAINT communications_direction_check CHECK (direction IN ('outbound', 'inbound'));

ALTER TABLE public.communications DROP CONSTRAINT IF EXISTS communications_status_check;
ALTER TABLE public.communications
  ADD CONSTRAINT communications_status_check CHECK (status IN ('sent', 'failed', 'received'));

-- Resend retries webhooks, so a received email is stored once.
CREATE UNIQUE INDEX IF NOT EXISTS communications_inbound_provider_id_key
  ON public.communications (provider_message_id)
  WHERE direction = 'inbound';
