-- Promotions shown on lankalux.com ("Current offer"), managed from admin → Website → Promotions.
-- Additive only. Only the service role (admin API routes) reads or writes this table;
-- lankalux.com reads active promotions through /api/site-content.

CREATE TABLE IF NOT EXISTS website_promotions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  -- Last day the promotion shows (Sri Lanka time). NULL = until switched off.
  ends_on DATE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE website_promotions ENABLE ROW LEVEL SECURITY;

-- Seed with the offer that was written into the site's pages, once.
INSERT INTO website_promotions (title, message, ends_on, sort_order)
SELECT
  'Free safari jeep',
  'For a limited time, confirmed bookings include a free safari jeep at one selected park (jeep only, not park tickets).',
  DATE '2026-10-31',
  10
WHERE NOT EXISTS (SELECT 1 FROM website_promotions);
