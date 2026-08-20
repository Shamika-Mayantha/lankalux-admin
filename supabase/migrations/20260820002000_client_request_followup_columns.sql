-- Additive columns already used by production on "Client Requests".
-- Safe to re-run.

ALTER TABLE "Client Requests"
  ADD COLUMN IF NOT EXISTS follow_up_emails_sent TEXT,
  ADD COLUMN IF NOT EXISTS link_opens TEXT,
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

COMMENT ON COLUMN "Client Requests".follow_up_emails_sent IS 'JSON array of { sent_at, template_id, template_name, subject } for each follow-up email sent';
COMMENT ON COLUMN "Client Requests".link_opens IS 'JSON array of { opened_at, option_index? } each time the client opens the itinerary link';
COMMENT ON COLUMN "Client Requests".cancellation_reason IS 'Reason entered when status is set to cancelled';
