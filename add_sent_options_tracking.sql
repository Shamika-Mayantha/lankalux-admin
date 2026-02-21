-- ============================================
-- Add Sent Options Tracking Column
-- ============================================
-- Run this in your Supabase SQL Editor
-- This adds a column to track all options that have been sent to the client
-- ============================================

-- Add sent_options column (JSON array to store all sent options with timestamps)
ALTER TABLE requests
ADD COLUMN IF NOT EXISTS sent_options JSONB DEFAULT '[]'::jsonb;

-- Add comment to document the column
COMMENT ON COLUMN requests.sent_options IS 'Array of sent options, each with option_index, sent_at timestamp, and option title';

-- Verify column was added
SELECT 
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'requests'
  AND column_name = 'sent_options';
