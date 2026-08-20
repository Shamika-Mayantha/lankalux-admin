-- Additive follow-up for the console invoices module.
-- Safe to run after 20260820000000_invoices_and_payments.sql.

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS chauffeur_guide_id TEXT;

ALTER TABLE public.invoice_settings
  ADD COLUMN IF NOT EXISTS show_vehicle_registration BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.invoice_settings
  ADD COLUMN IF NOT EXISTS default_client_note TEXT
  DEFAULT 'Thank you for choosing LankaLux. Please quote your invoice number when making payment.';
