-- Vehicle reservations: which vehicles are reserved on which dates.
-- Run this in the Supabase SQL Editor to create the table.

DROP TABLE IF EXISTS "Vehicle Reservations" CASCADE;

CREATE TABLE "Vehicle Reservations" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_name TEXT NOT NULL,
  reserved_date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (vehicle_name, reserved_date)
);

ALTER TABLE "Vehicle Reservations" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage Vehicle Reservations"
  ON "Vehicle Reservations"
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE INDEX idx_vehicle_reservations_vehicle_date
  ON "Vehicle Reservations" (vehicle_name, reserved_date);
