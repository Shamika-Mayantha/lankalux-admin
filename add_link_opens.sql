-- Track when the client opens the itinerary link (public page).
-- Run in Supabase SQL Editor. Table name may need to match your actual table (e.g. "Client Requests").

ALTER TABLE "Client Requests"
ADD COLUMN IF NOT EXISTS link_opens TEXT;

COMMENT ON COLUMN "Client Requests".link_opens IS 'JSON array of { opened_at, option_index? } each time the client opens the itinerary link';
