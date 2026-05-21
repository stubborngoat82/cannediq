-- ================================================================
-- Billing Contact Info
-- Run AFTER billing.sql and user-demographics.sql.
--
-- Adds phone, billing_country, billing_postal_code to profiles.
-- These are written by the stripe-webhook on checkout.session.completed.
-- full_name and company_name already exist from user-demographics.sql.
-- ================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone               TEXT,
  ADD COLUMN IF NOT EXISTS billing_country     TEXT,
  ADD COLUMN IF NOT EXISTS billing_postal_code TEXT;

SELECT 'billing-contact migration ready' AS status;
