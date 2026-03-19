-- Run in Supabase SQL editor if migrations are not applied automatically
ALTER TABLE "Client Requests"
ADD COLUMN IF NOT EXISTS hotel_options text;

-- Optional: public bucket for hotel images (create in Dashboard > Storage)
-- Bucket name: hotel-images
-- Public: yes (for email image URLs)
-- RLS: allow authenticated upload
