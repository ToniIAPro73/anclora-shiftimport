-- FASE 1.2G: commercial plan per organization (pre-Stripe foundation only —
-- no billing, no subscription lifecycle). Default 'free' for every existing
-- and new organization; onboarding sets it explicitly afterward (personal
-- org -> free, company org -> team, as a documented pre-billing trial
-- grant, never a simulated paid subscription — see docs/pricing-hypothesis.md).
ALTER TABLE organizations
  ADD COLUMN plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'personal', 'team'));
