-- A wa.me link that admin prepared is not a confirmed send: WhatsApp never tells us whether it was sent.
-- 'prepared' records it honestly; 'sent' stays for provider-confirmed sends (email via the mailer, WhatsApp Cloud API later).
ALTER TABLE public.communications DROP CONSTRAINT IF EXISTS communications_status_check;
ALTER TABLE public.communications
  ADD CONSTRAINT communications_status_check CHECK (status IN ('prepared', 'sent', 'failed', 'received'));
