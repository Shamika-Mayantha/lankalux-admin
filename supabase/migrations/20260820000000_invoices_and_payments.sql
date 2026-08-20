-- LankaLux invoices + payments module
-- ADDITIVE ONLY

-- ---------------------------------------------------------------------------
-- Invoice numbering
-- ---------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS public.invoice_number_seq START 1;

CREATE OR REPLACE FUNCTION public.next_invoice_number()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  next_num BIGINT;
BEGIN
  next_num := nextval('public.invoice_number_seq');
  RETURN 'LL-INV-' || lpad(next_num::TEXT, 3, '0');
END;
$$;

-- ---------------------------------------------------------------------------
-- Invoice settings (single row, editable in Settings)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.invoice_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  beneficiary_name TEXT,
  bank_name TEXT,
  account_number TEXT,
  branch_name TEXT,
  swift_code TEXT,
  iban TEXT,
  payment_reference_note TEXT,
  instructions_note TEXT,
  show_vehicle_registration BOOLEAN NOT NULL DEFAULT false,
  default_client_note TEXT DEFAULT 'Thank you for choosing LankaLux. Please quote your invoice number when making payment.',
  visible_fields JSONB NOT NULL DEFAULT '{
    "beneficiary_name": true,
    "bank_name": true,
    "account_number": true,
    "branch_name": true,
    "swift_code": true,
    "iban": false
  }'::jsonb,
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.invoice_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Invoices
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id TEXT NOT NULL REFERENCES "Client Requests"(id) ON DELETE CASCADE,
  selected_itinerary_id TEXT,
  vehicle_id TEXT,
  chauffeur_guide_id TEXT,
  share_link_token TEXT,
  revision_of UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  invoice_number TEXT NOT NULL UNIQUE DEFAULT public.next_invoice_number(),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'finalized', 'sent', 'partially_paid', 'paid', 'overdue', 'cancelled')),
  payment_status TEXT NOT NULL DEFAULT 'unpaid'
    CHECK (payment_status IN ('unpaid', 'partially_paid', 'paid', 'overdue')),
  invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  currency TEXT NOT NULL DEFAULT 'USD',
  package_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  package_description TEXT NOT NULL DEFAULT 'LankaLux Sri Lanka Journey',
  client_note TEXT,
  payment_instructions JSONB NOT NULL DEFAULT '{}'::jsonb,
  client_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  journey_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  vehicle_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  chauffeur_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  totals_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  secure_journey_url TEXT,
  finalized_at TIMESTAMPTZ,
  finalized_by TEXT,
  sent_at TIMESTAMPTZ,
  sent_by TEXT,
  cancelled_at TIMESTAMPTZ,
  cancelled_by TEXT,
  created_by TEXT,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invoices_request_idx ON public.invoices (request_id, created_at DESC);
CREATE INDEX IF NOT EXISTS invoices_status_idx ON public.invoices (status, payment_status);
CREATE INDEX IF NOT EXISTS invoices_revision_idx ON public.invoices (revision_of);

-- ---------------------------------------------------------------------------
-- Payments per invoice
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.invoice_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL,
  payment_date DATE NOT NULL,
  payment_method TEXT NOT NULL
    CHECK (payment_method IN ('bank_transfer', 'card', 'cash', 'online_payment', 'other')),
  reference_number TEXT,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'successful' CHECK (status IN ('successful', 'void')),
  created_by TEXT,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invoice_payments_invoice_idx
  ON public.invoice_payments (invoice_id, payment_date DESC, created_at DESC);

-- ---------------------------------------------------------------------------
-- Public invoice links (for WhatsApp / sharing finalized PDF)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.invoice_public_links (
  token TEXT PRIMARY KEY,
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS invoice_public_links_invoice_idx
  ON public.invoice_public_links (invoice_id, created_at DESC);

-- Keep sequence aligned if this migration is run on a DB where invoices already exist.
DO $$
DECLARE
  max_num BIGINT := 0;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'invoices'
  ) THEN
    SELECT COALESCE(MAX((regexp_match(invoice_number, '^LL-INV-(\d+)$'))[1]::BIGINT), 0)
    INTO max_num
    FROM public.invoices;
  END IF;

  IF max_num > 0 THEN
    PERFORM setval('public.invoice_number_seq', max_num, true);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.invoice_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_public_links ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'invoice_settings' AND policyname = 'Authenticated manage invoice settings') THEN
    CREATE POLICY "Authenticated manage invoice settings"
      ON public.invoice_settings FOR ALL TO authenticated
      USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'invoices' AND policyname = 'Authenticated manage invoices') THEN
    CREATE POLICY "Authenticated manage invoices"
      ON public.invoices FOR ALL TO authenticated
      USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'invoice_payments' AND policyname = 'Authenticated manage invoice payments') THEN
    CREATE POLICY "Authenticated manage invoice payments"
      ON public.invoice_payments FOR ALL TO authenticated
      USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'invoice_public_links' AND policyname = 'Authenticated manage invoice public links') THEN
    CREATE POLICY "Authenticated manage invoice public links"
      ON public.invoice_public_links FOR ALL TO authenticated
      USING (true) WITH CHECK (true);
  END IF;
END $$;
