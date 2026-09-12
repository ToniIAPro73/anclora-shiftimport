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
  theme TEXT NOT NULL DEFAULT 'SYSTEM'
    CHECK (theme IN ('SYSTEM', 'LIGHT', 'DARK')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE user_access_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  organization_person_id UUID,
  email_normalized TEXT NOT NULL,
  invited_by_user_id UUID REFERENCES users (id) ON DELETE SET NULL,
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

-- The sender must be a member of the same organization. Role authorization is
-- an API concern; tenant membership is enforced at the database boundary.
CREATE FUNCTION check_user_access_invitation_integrity()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.invited_by_user_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM memberships m
      WHERE m.user_id = NEW.invited_by_user_id
        AND m.organization_id = NEW.organization_id
    ) THEN
    RAISE EXCEPTION 'Invitation sender must belong to the invitation organization';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER trg_check_user_access_invitation_integrity
  AFTER INSERT OR UPDATE ON user_access_invitations
  DEFERRABLE INITIALLY IMMEDIATE
  FOR EACH ROW
  EXECUTE FUNCTION check_user_access_invitation_integrity();
