-- Photos and videos the content creator sends in the Telegram group, so Claude can review them.
-- The telegram-bot edge function downloads each one from Telegram (Bot API limit 20 MB) and keeps
-- it here as base64; Claude reads it through SQL, decodes it and looks at the photo or video frames.
-- Files are deleted after 2 days (Shamika, 28 Oct) to keep the database small.

CREATE TABLE IF NOT EXISTS public.telegram_media (
  id bigserial PRIMARY KEY,
  message_id bigint NOT NULL REFERENCES public.telegram_messages(id) ON DELETE CASCADE,
  kind text NOT NULL,            -- photo | video | video_thumb | document
  mime text,
  file_name text,
  width int,
  height int,
  duration_seconds int,
  size_bytes int,
  b64 text,                      -- null when the file was too big for the Bot API
  note text,                     -- why b64 is missing, if it is
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS telegram_media_message_idx ON public.telegram_media (message_id);

ALTER TABLE public.telegram_media ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.telegram_media FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.telegram_media_id_seq FROM PUBLIC, anon, authenticated;

SELECT cron.schedule(
  'telegram-media-cleanup',
  '20 21 * * *',
  $$DELETE FROM public.telegram_media WHERE created_at < now() - interval '2 days'$$
);
