-- Sale price of the itinerary that was sold. Guest/chauffeur apps use selected_option;
-- this column records what they paid so invoices and admin can show it.

ALTER TABLE "Client Requests"
  ADD COLUMN IF NOT EXISTS sold_price TEXT;

COMMENT ON COLUMN "Client Requests".sold_price IS 'Client-facing sale price of the sold itinerary, e.g. USD 4,200';
