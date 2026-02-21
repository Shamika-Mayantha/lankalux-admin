-- ============================================
-- Add Email Tracking Columns to Requests Table
-- ============================================
-- Run this in your Supabase SQL Editor
-- This adds columns for tracking email sends
-- ============================================

-- Add sent_at column (timestamp of first email send)
ALTER TABLE requests
ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;

-- Add last_sent_at column (timestamp of most recent email send)
ALTER TABLE requests
ADD COLUMN IF NOT EXISTS last_sent_at TIMESTAMPTZ;

-- Add email_sent_count column (number of times email was sent)
ALTER TABLE requests
ADD COLUMN IF NOT EXISTS email_sent_count INTEGER DEFAULT 0;

-- Add comments to document the columns
COMMENT ON COLUMN requests.sent_at IS 'Timestamp when itinerary was first sent to client';
COMMENT ON COLUMN requests.last_sent_at IS 'Timestamp when itinerary was most recently sent to client';
COMMENT ON COLUMN requests.email_sent_count IS 'Total number of times itinerary email has been sent';

-- Verify columns were added
SELECT 
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'requests'
  AND column_name IN ('sent_at', 'last_sent_at', 'email_sent_count')
ORDER BY column_name;
