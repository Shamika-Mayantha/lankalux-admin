-- Store reason when a request is cancelled.
-- Run in Supabase SQL Editor.

ALTER TABLE "Client Requests"
ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

COMMENT ON COLUMN "Client Requests".cancellation_reason IS 'Reason entered when status is set to cancelled';
