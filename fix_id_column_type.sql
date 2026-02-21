-- ============================================
-- Fix ID Column Type: UUID to TEXT
-- ============================================
-- This script changes the requests.id column from UUID to TEXT
-- to support sequential IDs (req-id-001, req-id-002, etc.)
-- 
-- IMPORTANT: Run this in your Supabase SQL Editor
-- ============================================

-- Step 1: Drop the primary key constraint (if it exists)
-- This is necessary before changing the column type
ALTER TABLE requests DROP CONSTRAINT IF EXISTS requests_pkey;

-- Step 2: Change the ID column type from UUID to TEXT
-- Using USING clause to convert existing UUIDs to text (if any exist)
ALTER TABLE requests 
ALTER COLUMN id TYPE TEXT USING id::TEXT;

-- Step 3: Re-add the primary key constraint
ALTER TABLE requests 
ADD PRIMARY KEY (id);

-- Step 4: Remove any default UUID generation (if it exists)
ALTER TABLE requests 
ALTER COLUMN id DROP DEFAULT;

-- Done! The id column is now TEXT and can accept "req-id-001" format IDs
-- Note: If you had existing UUID data, it has been converted to text format
-- New requests will use sequential IDs like "req-id-001", "req-id-002", etc.
