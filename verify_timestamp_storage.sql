-- ============================================
-- Verify Timestamp Storage for Sent Options
-- ============================================
-- Run this in your Supabase SQL Editor
-- This verifies that timestamps are being stored correctly
-- ============================================

-- Check the structure of sent_options column
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'requests'
  AND column_name IN ('sent_options', 'sent_at', 'last_sent_at')
ORDER BY column_name;

-- View sample sent_options data with timestamps
SELECT 
  id,
  client_name,
  sent_at,
  last_sent_at,
  sent_options,
  -- Extract timestamps from sent_options array
  jsonb_array_elements(sent_options)::jsonb->>'sent_at' as option_sent_at,
  jsonb_array_elements(sent_options)::jsonb->>'option_title' as option_title,
  jsonb_array_elements(sent_options)::jsonb->>'option_index' as option_index
FROM requests
WHERE sent_options IS NOT NULL 
  AND sent_options != '[]'::jsonb
  AND jsonb_array_length(sent_options) > 0
LIMIT 10;

-- Count requests with sent options and their timestamp format
SELECT 
  COUNT(*) as total_with_sent_options,
  COUNT(CASE WHEN sent_at IS NOT NULL THEN 1 END) as has_sent_at,
  COUNT(CASE WHEN last_sent_at IS NOT NULL THEN 1 END) as has_last_sent_at,
  COUNT(CASE 
    WHEN sent_options IS NOT NULL 
    AND jsonb_array_length(sent_options) > 0 
    AND jsonb_array_elements(sent_options)::jsonb->>'sent_at' IS NOT NULL 
    THEN 1 
  END) as has_option_timestamps
FROM requests
WHERE sent_options IS NOT NULL 
  AND sent_options != '[]'::jsonb;

-- Note: Timestamps are stored as ISO 8601 strings (e.g., "2024-01-15T10:30:00.000Z")
-- in the sent_options JSONB array, which includes both date and time information.
