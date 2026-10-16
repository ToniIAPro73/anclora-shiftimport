-- Company plan = versioned baseline of the planning the company communicated.
-- Additive and backward compatible: no existing column or row is rewritten.

ALTER TABLE imports ADD COLUMN IF NOT EXISTS document_fingerprint TEXT;
ALTER TABLE imports ADD COLUMN IF NOT EXISTS plan_fingerprint TEXT;
ALTER TABLE imports ADD COLUMN IF NOT EXISTS import_decision TEXT;
ALTER TABLE imports ADD COLUMN IF NOT EXISTS document_class TEXT;
ALTER TABLE imports ADD COLUMN IF NOT EXISTS temporal_class TEXT;
ALTER TABLE imports ADD COLUMN IF NOT EXISTS duplicate_kind TEXT;

ALTER TABLE imports DROP CONSTRAINT IF EXISTS imports_import_decision_check;
ALTER TABLE imports ADD CONSTRAINT imports_import_decision_check
  CHECK (import_decision IS NULL OR import_decision IN ('historical-only', 'historical-and-plan'));
ALTER TABLE imports DROP CONSTRAINT IF EXISTS imports_document_class_check;
ALTER TABLE imports ADD CONSTRAINT imports_document_class_check
  CHECK (document_class IS NULL OR document_class IN ('COMPANY_PLAN', 'COMPANY_PLAN_UPDATE', 'HISTORICAL_CALENDAR', 'UNDETERMINED'));
ALTER TABLE imports DROP CONSTRAINT IF EXISTS imports_temporal_class_check;
ALTER TABLE imports ADD CONSTRAINT imports_temporal_class_check
  CHECK (temporal_class IS NULL OR temporal_class IN ('HISTORICAL', 'FUTURE', 'MIXED'));
ALTER TABLE imports DROP CONSTRAINT IF EXISTS imports_duplicate_kind_check;
ALTER TABLE imports ADD CONSTRAINT imports_duplicate_kind_check
  CHECK (duplicate_kind IS NULL OR duplicate_kind IN ('DUPLICATE_FILE', 'DUPLICATE_DOCUMENT', 'DUPLICATE_PLAN'));

CREATE INDEX IF NOT EXISTS imports_org_document_fingerprint_idx
  ON imports (organization_id, document_fingerprint) WHERE document_fingerprint IS NOT NULL;

CREATE TABLE IF NOT EXISTS company_plan_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  -- 'global' for organisation-wide plans, otherwise the area UUID as text.
  scope_key TEXT NOT NULL,
  revision_number INTEGER NOT NULL CHECK (revision_number >= 1),
  import_id UUID REFERENCES imports (id) ON DELETE SET NULL,
  plan_fingerprint TEXT NOT NULL,
  document_fingerprint TEXT,
  document_class TEXT,
  coverage_from DATE NOT NULL,
  coverage_to DATE NOT NULL,
  row_count INTEGER NOT NULL CHECK (row_count >= 0),
  -- Normalised business rows keyed by employee BUSINESS KEY (payroll number), never by a UUID.
  rows JSONB NOT NULL,
  -- What this revision changed against its baseline (counts + per-day outcomes).
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id UUID REFERENCES users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT company_plan_revisions_range_check CHECK (coverage_to >= coverage_from),
  -- Two confirmations racing from the same baseline cannot both create revision N+1.
  CONSTRAINT company_plan_revisions_unique UNIQUE (organization_id, scope_key, revision_number)
);

CREATE INDEX IF NOT EXISTS company_plan_revisions_lookup_idx
  ON company_plan_revisions (organization_id, scope_key, coverage_from, coverage_to);
