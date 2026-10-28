-- Finance: profit per sold trip plus monthly business expenses (ad spend, salaries, other).
-- request_finance holds what a sold request earned and what it cost; finance_expenses holds
-- monthly costs that are not tied to one trip. Each amount keeps its own currency plus the rate
-- used to convert it to the reporting currency (LKR), so a GBP sale and LKR hotel bills add up.
-- Only supervisors read or write, through the admin API (service role). The agent role has no access.
-- Additive and idempotent. Rollback: DROP TABLE public.finance_expenses; DROP TABLE public.request_finance;

CREATE TABLE IF NOT EXISTS public.request_finance (
  request_id text PRIMARY KEY REFERENCES public."Client Requests"(id) ON DELETE CASCADE,
  sold_on date NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Colombo')::date,
  sale_amount numeric(14, 2) NOT NULL DEFAULT 0 CHECK (sale_amount >= 0),
  sale_currency text NOT NULL DEFAULT 'USD',
  sale_rate numeric(14, 4) NOT NULL DEFAULT 1 CHECK (sale_rate > 0),
  cost_hotels numeric(14, 2) NOT NULL DEFAULT 0 CHECK (cost_hotels >= 0),
  cost_transport numeric(14, 2) NOT NULL DEFAULT 0 CHECK (cost_transport >= 0),
  cost_activities numeric(14, 2) NOT NULL DEFAULT 0 CHECK (cost_activities >= 0),
  cost_other numeric(14, 2) NOT NULL DEFAULT 0 CHECK (cost_other >= 0),
  cost_currency text NOT NULL DEFAULT 'LKR',
  cost_rate numeric(14, 4) NOT NULL DEFAULT 1 CHECK (cost_rate > 0),
  note text NOT NULL DEFAULT '',
  updated_by text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS request_finance_sold_on_idx ON public.request_finance (sold_on);

CREATE TABLE IF NOT EXISTS public.finance_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month date NOT NULL CHECK (extract(day FROM month) = 1),
  category text NOT NULL CHECK (category IN ('ad_spend', 'salary', 'software', 'office', 'other')),
  label text NOT NULL DEFAULT '',
  amount numeric(14, 2) NOT NULL CHECK (amount >= 0),
  currency text NOT NULL DEFAULT 'LKR',
  rate numeric(14, 4) NOT NULL DEFAULT 1 CHECK (rate > 0),
  note text NOT NULL DEFAULT '',
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS finance_expenses_month_idx ON public.finance_expenses (month);

ALTER TABLE public.request_finance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_expenses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Supervisors read request_finance" ON public.request_finance;
CREATE POLICY "Supervisors read request_finance" ON public.request_finance FOR SELECT TO authenticated USING (public.is_lankalux_admin());
DROP POLICY IF EXISTS "Supervisors read finance_expenses" ON public.finance_expenses;
CREATE POLICY "Supervisors read finance_expenses" ON public.finance_expenses FOR SELECT TO authenticated USING (public.is_lankalux_admin());
REVOKE ALL ON public.request_finance, public.finance_expenses FROM anon;
