-- ============================================
-- LankaLux Admin - Request ID Migration
-- ============================================
-- This script updates the requests table to support sequential IDs (req-id-001, req-id-002, etc.)
-- Run this in your Supabase SQL Editor
-- ============================================

-- Step 1: Add passenger columns (if not already added)
ALTER TABLE requests
ADD COLUMN IF NOT EXISTS number_of_adults INTEGER;

ALTER TABLE requests
ADD COLUMN IF NOT EXISTS number_of_children INTEGER;

ALTER TABLE requests
ADD COLUMN IF NOT EXISTS children_ages TEXT;

-- Step 2: Add comments to document the columns
COMMENT ON COLUMN requests.number_of_adults IS 'Number of adult passengers';
COMMENT ON COLUMN requests.number_of_children IS 'Number of child passengers';
COMMENT ON COLUMN requests.children_ages IS 'JSON array of children ages (one age per child)';

-- Step 3: Change ID column type from UUID to TEXT (if needed)
-- WARNING: This will work if you have NO existing data, or if you want to migrate existing UUIDs
-- If you have existing data with UUID IDs, you have two options:
-- 
-- OPTION A: Keep existing UUIDs and start new sequential IDs (recommended if you have existing data)
-- Skip the ALTER COLUMN statement below - the app will handle both UUID and sequential IDs
--
-- OPTION B: Convert all existing UUIDs to sequential IDs (only if you want to migrate everything)
-- Uncomment the ALTER COLUMN statement below, but be aware this will change all existing IDs

-- Uncomment the line below ONLY if you want to change the column type:
-- ALTER TABLE requests ALTER COLUMN id TYPE TEXT;

-- Note: The application code will automatically generate sequential IDs (req-id-001, req-id-002, etc.)
-- for all new requests. Existing requests with UUID IDs will continue to work.
