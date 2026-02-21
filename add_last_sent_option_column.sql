-- ============================================
-- Add last_sent_option Column to Requests Table
-- ============================================
-- Run this in your Supabase SQL Editor
-- This adds a column to track which itinerary option was last sent
-- ============================================

-- Add last_sent_option column (index of the last sent itinerary option)
ALTER TABLE requests
ADD COLUMN IF NOT EXISTS last_sent_option INTEGER;

-- Add comment to document the column
COMMENT ON COLUMN requests.last_sent_option IS 'Index of the itinerary option that was last sent to the client';

-- Verify column was added
SELECT 
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'requests'
  AND column_name = 'last_sent_option';
