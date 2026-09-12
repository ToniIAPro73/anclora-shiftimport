-- Migration 0039: application account lifecycle, access invitations, and
-- global user preferences. Transaction control belongs to db/migrate.mjs.

-- The existing users.display_name is the canonical global visible name. This
-- migration adds only account lifecycle state; it does not duplicate that
-- value in user_preferences.
ALTER TABLE users
  ADD COLUMN account_status TEXT NOT NULL DEFAULT 'ACTIVE',
  ADD CONSTRAINT users_account_status_check
    CHECK (account_status IN ('PENDING_INVITATION', 'ACTIVE', 'SUSPENDED'));

CREATE TABLE user_preferences (
  user_id UUID PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  locale TEXT NOT NULL DEFAULT 'es'
    CHECK (locale IN ('es', 'en')),
  theme TEXT NOT NULL DEFAULT 'system'
    CHECK (theme IN ('system', 'light', 'dark')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE user_access_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  organization_person_id UUID,
  email_normalized TEXT NOT NULL,
  -- Invitation provenance is mandatory. Physical deletion of users with
  -- invitation history is intentionally restricted; deactivate instead.
  invited_by_user_id UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  token_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  last_sent_at TIMESTAMPTZ,
  last_delivery_at TIMESTAMPTZ,
  delivery_status TEXT NOT NULL DEFAULT 'NOT_SENT'
    CHECK (delivery_status IN ('NOT_SENT', 'QUEUED', 'SENT', 'DELIVERED', 'BOUNCED', 'COMPLAINED', 'FAILED')),
  send_attempts INTEGER NOT NULL DEFAULT 0 CHECK (send_attempts >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_access_invitations_person_org_fkey
    FOREIGN KEY (organization_person_id, organization_id)
    REFERENCES organization_people (id, organization_id) ON DELETE CASCADE,
  CONSTRAINT user_access_invitations_email_normalized_check
    CHECK (
      email_normalized = lower(btrim(email_normalized))
      AND email_normalized !~ '[[:space:]]'
      AND position('@' IN email_normalized) > 1
      AND position('.' IN split_part(email_normalized, '@', 2)) > 1
    ),
  CONSTRAINT user_access_invitations_token_hash_format_check
    CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT user_access_invitations_expiry_check
    CHECK (expires_at > created_at),
  CONSTRAINT user_access_invitations_state_timestamps_check
    CHECK (
      (status IN ('PENDING', 'EXPIRED') AND accepted_at IS NULL AND revoked_at IS NULL)
      OR (status = 'ACCEPTED' AND accepted_at IS NOT NULL AND revoked_at IS NULL)
      OR (status = 'REVOKED' AND accepted_at IS NULL AND revoked_at IS NOT NULL)
    ),
  CONSTRAINT user_access_invitations_event_order_check
    CHECK (
      (accepted_at IS NULL OR accepted_at >= created_at)
      AND (revoked_at IS NULL OR revoked_at >= created_at)
      AND (last_sent_at IS NULL OR last_sent_at >= created_at)
      AND (last_delivery_at IS NULL OR last_delivery_at >= created_at)
    ),
  CONSTRAINT user_access_invitations_token_hash_key UNIQUE (token_hash)
);

CREATE UNIQUE INDEX user_access_invitations_pending_org_email_uidx
  ON user_access_invitations (organization_id, email_normalized)
  WHERE status = 'PENDING';

CREATE UNIQUE INDEX user_access_invitations_pending_org_person_uidx
  ON user_access_invitations (organization_id, organization_person_id)
  WHERE status = 'PENDING' AND organization_person_id IS NOT NULL;

CREATE INDEX user_access_invitations_org_status_idx
  ON user_access_invitations (organization_id, status, created_at DESC);

CREATE INDEX user_access_invitations_email_status_idx
  ON user_access_invitations (email_normalized, status);

CREATE INDEX user_access_invitations_expiry_idx
  ON user_access_invitations (expires_at)
  WHERE status = 'PENDING';

CREATE INDEX user_access_invitations_delivery_idx
  ON user_access_invitations (delivery_status, last_sent_at);

-- The sender is an active, tenant-scoped actor with a currently valid
-- OWNER/ADMIN role, or an organization-scoped PLANNER role. The temporal role
-- row is required so a historical role cannot authorize a new invitation.
CREATE FUNCTION check_user_access_invitation_integrity()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT'
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.invited_by_user_id IS DISTINCT FROM OLD.invited_by_user_id THEN
    IF NOT EXISTS (
    SELECT 1
    FROM users u
    JOIN memberships m
      ON m.user_id = u.id
     AND m.organization_id = NEW.organization_id
    JOIN organization_people op
      ON op.user_id = m.user_id
     AND op.organization_id = m.organization_id
     AND op.status = 'ACTIVE'
    JOIN person_role_periods prp
      ON prp.organization_person_id = op.id
     AND prp.organization_id = op.organization_id
     AND prp.role = m.role
     AND prp.valid_from <= CURRENT_DATE
     AND (prp.valid_to IS NULL OR prp.valid_to >= CURRENT_DATE)
    WHERE u.id = NEW.invited_by_user_id
      AND u.account_status = 'ACTIVE'
      AND m.role IN ('OWNER', 'ADMIN', 'PLANNER')
      AND (m.role <> 'PLANNER' OR m.planner_scope_type = 'ORGANIZATION')
    ) THEN
      RAISE EXCEPTION 'Invitation sender must be an active, authorized actor in the invitation organization';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER trg_check_user_access_invitation_integrity
  AFTER INSERT OR UPDATE ON user_access_invitations
  DEFERRABLE INITIALLY IMMEDIATE
  FOR EACH ROW
  EXECUTE FUNCTION check_user_access_invitation_integrity();

-- A pending organization person is a deliberate invitation staging state, not
-- an unbounded orphan state. The unique partial index above enforces "at most
-- one"; this deferred cross-table trigger enforces the matching "exactly one"
-- and the reverse direction (a person-bound pending invitation requires a
-- pending person). Deferral permits the future activation transaction to
-- update person, membership, user and invitation in any safe order.
CREATE FUNCTION check_user_access_pending_person_invitation_integrity()
RETURNS TRIGGER AS $$
DECLARE
  v_person_id UUID;
  v_organization_id UUID;
  v_person_status TEXT;
  v_pending_count INTEGER;
BEGIN
  -- Deletions have their own immediate guard below. Constraint-triggered
  -- cross-table checks only need to validate surviving rows.
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  IF TG_TABLE_NAME = 'organization_people' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    v_person_id := NEW.id;
    v_organization_id := NEW.organization_id;
  ELSE
    IF TG_OP = 'DELETE' THEN
      v_person_id := OLD.organization_person_id;
      v_organization_id := OLD.organization_id;
    ELSE
      v_person_id := NEW.organization_person_id;
      v_organization_id := NEW.organization_id;
    END IF;
  END IF;

  IF v_person_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT op.status
    INTO v_person_status
    FROM organization_people op
   WHERE op.id = v_person_id
     AND op.organization_id = v_organization_id;

  -- A deleted person no longer has a pending-person invariant to satisfy.
  IF NOT FOUND THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT count(*)::INTEGER
    INTO v_pending_count
    FROM user_access_invitations i
   WHERE i.organization_id = v_organization_id
     AND i.organization_person_id = v_person_id
     AND i.status = 'PENDING';

  IF v_person_status = 'PENDING_INVITATION' AND v_pending_count <> 1 THEN
    RAISE EXCEPTION 'Pending organization person must have exactly one pending access invitation';
  END IF;

  IF v_person_status <> 'PENDING_INVITATION'
     AND EXISTS (
       SELECT 1
         FROM user_access_invitations i
        WHERE i.organization_id = v_organization_id
          AND i.organization_person_id = v_person_id
          AND i.status = 'PENDING'
     ) THEN
    RAISE EXCEPTION 'A pending access invitation may reference only a pending organization person';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER trg_check_user_access_pending_person_on_person
  AFTER INSERT OR UPDATE OR DELETE ON organization_people
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION check_user_access_pending_person_invitation_integrity();

CREATE CONSTRAINT TRIGGER trg_check_user_access_pending_person_on_invitation
  AFTER INSERT OR UPDATE OR DELETE ON user_access_invitations
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION check_user_access_pending_person_invitation_integrity();

CREATE FUNCTION guard_user_access_invitation_delete()
RETURNS TRIGGER AS $$
BEGIN
  -- FK actions execute nested row triggers; their parent deletion removes the
  -- person/organization as well and must not be treated as manual orphaning.
  IF pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM organization_people op
     WHERE op.id = OLD.organization_person_id
       AND op.organization_id = OLD.organization_id
       AND op.status = 'PENDING_INVITATION'
  ) THEN
    RAISE EXCEPTION 'A pending access invitation cannot be deleted while its person is pending';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_guard_user_access_invitation_delete
  BEFORE DELETE ON user_access_invitations
  FOR EACH ROW
  EXECUTE FUNCTION guard_user_access_invitation_delete();

-- Tokens are issued as hashes and are never replaced in-place. Terminal rows
-- are immutable for identity, tenancy, provenance and lifecycle fields. Only
-- delivery metadata remains mutable for future provider callbacks/retries.
CREATE FUNCTION guard_user_access_invitation_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.token_hash IS DISTINCT FROM OLD.token_hash THEN
    RAISE EXCEPTION 'Invitation token hash is immutable';
  END IF;

  IF NEW.status = 'EXPIRED' AND NEW.expires_at > CURRENT_TIMESTAMP THEN
    RAISE EXCEPTION 'An invitation cannot be marked expired before its expiry time';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status IN ('ACCEPTED', 'REVOKED', 'EXPIRED') THEN
    IF NEW.status IS DISTINCT FROM OLD.status
       OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
       OR NEW.organization_person_id IS DISTINCT FROM OLD.organization_person_id
       OR NEW.email_normalized IS DISTINCT FROM OLD.email_normalized
       OR NEW.invited_by_user_id IS DISTINCT FROM OLD.invited_by_user_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
       OR NEW.accepted_at IS DISTINCT FROM OLD.accepted_at
       OR NEW.revoked_at IS DISTINCT FROM OLD.revoked_at THEN
      RAISE EXCEPTION 'Terminal access invitations cannot change identity, tenancy or lifecycle fields';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_guard_user_access_invitation_mutation
  BEFORE INSERT OR UPDATE ON user_access_invitations
  FOR EACH ROW
  EXECUTE FUNCTION guard_user_access_invitation_mutation();
