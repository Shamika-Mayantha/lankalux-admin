-- Payment links: a Revolut checkout link (made by hand in the Revolut app) wrapped in a branded
-- LankaLux pay page at journey.lankalux.com/pay/<token>. The client pays on Revolut's own page;
-- LankaLux never sees card details. Staff tap "Mark paid" when Revolut notifies them, which also
-- records the payment on the request's invoice when there is one.
-- Only the admin API (service role) reads or writes. The agent role and anon have no access.
-- Additive and idempotent. Rollback: DROP TABLE public.payment_links;

CREATE TABLE IF NOT EXISTS public.payment_links (
  token text PRIMARY KEY,
  request_id text NOT NULL REFERENCES public."Client Requests"(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT 'Deposit',
  amount numeric(12, 2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'GBP',
  provider_url text NOT NULL CHECK (provider_url ~ '^https://(checkout\.revolut\.com|revolut\.me)/'),
  note text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'paid', 'cancelled')),
  first_opened_at timestamptz,
  paid_at timestamptz,
  paid_by text,
  invoice_payment_id uuid REFERENCES public.invoice_payments(id) ON DELETE SET NULL,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payment_links_request_idx ON public.payment_links (request_id, created_at DESC);

ALTER TABLE public.payment_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payment_links FROM anon, authenticated;
