-- Add new passenger columns to requests table
-- Run these SQL statements in your Supabase SQL Editor

-- Add number_of_adults column
ALTER TABLE requests
ADD COLUMN IF NOT EXISTS number_of_adults INTEGER;

-- Add number_of_children column
ALTER TABLE requests
ADD COLUMN IF NOT EXISTS number_of_children INTEGER;

-- Add children_ages column (stores JSON array as text)
ALTER TABLE requests
ADD COLUMN IF NOT EXISTS children_ages TEXT;

-- Optional: Add comments to document the columns
COMMENT ON COLUMN requests.number_of_adults IS 'Number of adult passengers';
COMMENT ON COLUMN requests.number_of_children IS 'Number of child passengers';
COMMENT ON COLUMN requests.children_ages IS 'JSON array of children ages (one age per child)';
