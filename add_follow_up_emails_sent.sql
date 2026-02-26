-- Track follow-up (template) emails sent per request.
-- Run in Supabase SQL Editor. Table name may need to match your actual table (e.g. "Client Requests").

ALTER TABLE "Client Requests"
ADD COLUMN IF NOT EXISTS follow_up_emails_sent TEXT;

COMMENT ON COLUMN "Client Requests".follow_up_emails_sent IS 'JSON array of { sent_at, template_id, template_name, subject } for each follow-up email sent';
