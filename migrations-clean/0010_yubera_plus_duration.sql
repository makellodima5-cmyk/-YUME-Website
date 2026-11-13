-- Store the purchased YUBERA Plus term with each invoice.
-- Existing invoices retain the original one-month duration.
ALTER TABLE yume_plus_payments
  ADD COLUMN period_days INTEGER NOT NULL DEFAULT 30
  CHECK (period_days IN (30, 90));
