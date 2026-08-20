-- Vehicle date reservations used by /dashboard/vehicle-reservations.
-- Additive only. Does not drop existing data.

CREATE TABLE IF NOT EXISTS "Vehicle Reservations" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_name TEXT NOT NULL,
  reserved_date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (vehicle_name, reserved_date)
);

ALTER TABLE "Vehicle Reservations" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can manage Vehicle Reservations" ON "Vehicle Reservations";
CREATE POLICY "Authenticated users can manage Vehicle Reservations"
  ON "Vehicle Reservations"
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_vehicle_reservations_vehicle_date
  ON "Vehicle Reservations" (vehicle_name, reserved_date);
