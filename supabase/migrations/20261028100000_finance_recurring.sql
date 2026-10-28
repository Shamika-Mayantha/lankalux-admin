-- Recurring expenses: an expense ticked "repeats monthly" is copied into each new month (up to the
-- current one) when the Finance page loads. Rows of one recurring cost share a series_id; the
-- latest row's `repeats` decides whether the series continues.
-- Additive and idempotent. Rollback: DROP INDEX public.finance_expenses_series_month_idx;
--   ALTER TABLE public.finance_expenses DROP COLUMN series_id, DROP COLUMN repeats;

ALTER TABLE public.finance_expenses
  ADD COLUMN IF NOT EXISTS repeats boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS series_id uuid;
-- Not partial, so upsert ON CONFLICT (series_id, month) can use it; NULL series_ids never clash.
CREATE UNIQUE INDEX IF NOT EXISTS finance_expenses_series_month_idx
  ON public.finance_expenses (series_id, month);
