-- ============================================
-- Setup Sent Options Tracking
-- ============================================
-- Run this in your Supabase SQL Editor
-- This will add the sent_options column and initialize it for all existing records
-- ============================================

-- Step 1: Add sent_options column if it doesn't exist
ALTER TABLE requests
ADD COLUMN IF NOT EXISTS sent_options JSONB DEFAULT '[]'::jsonb;

-- Step 2: Initialize sent_options for existing records that have sent_at but null sent_options
-- This will create entries for options that were already sent, including the itinerary URL
UPDATE requests
SET sent_options = COALESCE(
  CASE 
    WHEN last_sent_option IS NOT NULL AND sent_at IS NOT NULL AND public_token IS NOT NULL THEN
      jsonb_build_array(
        jsonb_build_object(
          'option_index', last_sent_option,
          'sent_at', COALESCE(last_sent_at, sent_at),
          'option_title', NULL,
          'itinerary_url', 'https://admin.lankalux.com/itinerary/' || public_token || '/' || last_sent_option::text
        )
      )
    ELSE '[]'::jsonb
  END,
  '[]'::jsonb
)
WHERE sent_options IS NULL OR sent_options = '[]'::jsonb::text::jsonb
  AND (sent_at IS NOT NULL OR last_sent_at IS NOT NULL);

-- Step 3: Add comment to document the column
COMMENT ON COLUMN requests.sent_options IS 'Array of sent options, each with option_index, sent_at timestamp, option_title, and itinerary_url';

-- Step 4: Verify column was added and check some sample data
SELECT 
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'requests'
  AND column_name = 'sent_options';

-- Step 5: Check how many records have sent_options
SELECT 
  COUNT(*) as total_requests,
  COUNT(CASE WHEN sent_options IS NOT NULL AND sent_options != '[]'::jsonb THEN 1 END) as requests_with_sent_options,
  COUNT(CASE WHEN sent_at IS NOT NULL THEN 1 END) as requests_with_sent_at
FROM requests;
