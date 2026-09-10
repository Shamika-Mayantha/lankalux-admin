-- Driver Pack operational overlay for sold trips.
-- ADDITIVE ONLY. Does not drop, rename, or rewrite existing columns.
-- Existing chauffeur assignment, flights, dates, itineraries, hotels, and invoices stay untouched.
--
-- driver_pack stores per-trip operational details that are not already first-class
-- columns (guide phone override, vehicle registration, arrival/departure times, notes).
-- Name / flights / dates still prefer the existing Client Requests columns.

ALTER TABLE "Client Requests"
  ADD COLUMN IF NOT EXISTS driver_pack JSONB NOT NULL DEFAULT '{}'::jsonb;
