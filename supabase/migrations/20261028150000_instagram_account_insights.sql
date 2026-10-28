-- Audience insights for the whole Instagram account (follower countries, cities, age, gender, 30 day
-- totals, daily reach, hourly online followers when Instagram allows it), written by instagram-sync
-- so the weekly check and the posting-time advice can use real audience data.
ALTER TABLE public.instagram_account ADD COLUMN IF NOT EXISTS insights jsonb;
