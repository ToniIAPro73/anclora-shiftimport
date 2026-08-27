-- Migration 0009: Format Memory v1 — organization-scoped learned format
-- profiles (Phase 2 of multi-format ingestion). Forward-only, idempotent-safe.
-- No PII columns: signature is a one-way structural hash, employee_row_index
-- is a numeric row position (never row content). See
-- sdd/features/format-memory-v1/02_DATA_API_CONTRACT.md.

BEGIN;

CREATE TABLE IF NOT EXISTS format_profiles (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id        UUID NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  logical_profile_id     UUID NOT NULL,
  version                INTEGER NOT NULL DEFAULT 1,
  status                 TEXT NOT NULL DEFAULT 'candidate'
                           CHECK (status IN ('candidate','validated','verified','legacy','deprecated')),
  signature              JSONB NOT NULL,
  source_type            TEXT NOT NULL CHECK (source_type IN ('pdf','tabular')),
  display_name           TEXT NOT NULL,
  parser_config          JSONB NOT NULL DEFAULT '{}'::jsonb,
  token_aliases          JSONB NOT NULL DEFAULT '{}'::jsonb,
  code_times             JSONB NOT NULL DEFAULT '{}'::jsonb,
  off_tokens             JSONB NOT NULL DEFAULT '[]'::jsonb,
  employee_row_strategy  TEXT NOT NULL CHECK (employee_row_strategy IN ('identifier','name','manual-row')),
  employee_row_index     INTEGER,
  day_column_map         JSONB,
  tabular_memory         JSONB,
  use_count              INTEGER NOT NULL DEFAULT 0,
  successful_use_count   INTEGER NOT NULL DEFAULT 0,
  last_used_at           TIMESTAMPTZ,
  created_by_user_id     UUID REFERENCES users (id) ON DELETE SET NULL,
  supersedes_profile_id  UUID REFERENCES format_profiles (id) ON DELETE SET NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tenant scan
CREATE INDEX IF NOT EXISTS format_profiles_organization_idx
  ON format_profiles (organization_id);

-- Version-history lookup for one logical family
CREATE INDEX IF NOT EXISTS format_profiles_org_logical_idx
  ON format_profiles (organization_id, logical_profile_id);

-- No duplicate version numbers within a logical family
CREATE UNIQUE INDEX IF NOT EXISTS format_profiles_org_logical_version_idx
  ON format_profiles (organization_id, logical_profile_id, version);

-- Auto-selection candidate scan (status filter)
CREATE INDEX IF NOT EXISTS format_profiles_org_status_idx
  ON format_profiles (organization_id, status);

-- Hot match-lookup path: exact structural hash within an org
CREATE INDEX IF NOT EXISTS format_profiles_org_structurehash_idx
  ON format_profiles (organization_id, (signature->>'structureHash'));

COMMIT;
