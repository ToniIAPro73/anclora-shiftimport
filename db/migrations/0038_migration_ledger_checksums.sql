-- Migration 0038: add canonical SHA-256 checksum tracking to _migrations ledger.
-- Backfills known checksums for historical migrations 0001 through 0037.
-- Enforces 64-character lowercase hex format constraint and NOT NULL.

BEGIN;

ALTER TABLE _migrations
  ADD COLUMN IF NOT EXISTS checksum TEXT;

-- Backfill known canonical checksums for 0001 through 0037
UPDATE _migrations SET checksum = 'b269aac2ac783b3ffb983a1d99325d77bf1482218451be6352740287d2a00eff' WHERE name = '0001_init.sql' AND (checksum IS NULL OR checksum = '');
UPDATE _migrations SET checksum = '8710c0e3cd56d4ed3f58cca0c49d730e35b986c1a0bcb91a092450d74453bc86' WHERE name = '0002_password_reset.sql' AND (checksum IS NULL OR checksum = '');
UPDATE _migrations SET checksum = '48a0bb1ded8353ef59e2ea923a65cfb881d8351c87a9fd77eab4e95faa00dc20' WHERE name = '0003_login_attempts.sql' AND (checksum IS NULL OR checksum = '');
UPDATE _migrations SET checksum = '91e542209b6bcc9fc9f00825f95a4cfb3aeca2a8e883662a5e3ee187ea74b4c2' WHERE name = '0004_organization_plan.sql' AND (checksum IS NULL OR checksum = '');
UPDATE _migrations SET checksum = '923d83f0ac83ce08032796db4c814cac91884188c5a94151479d6052e8c445da' WHERE name = '0005_employee_lifecycle.sql' AND (checksum IS NULL OR checksum = '');
UPDATE _migrations SET checksum = '23158701bb16b1278d0cb0081b5cdf454417651a5d7af7623f3006ebfb0ce7fb' WHERE name = '0006_employee_pending_access.sql' AND (checksum IS NULL OR checksum = '');
UPDATE _migrations SET checksum = 'e29019d76c8c81bc64b5e786a44907210051c149a8fd0e88ca51e67760130526' WHERE name = '0007_remove_manager_role.sql' AND (checksum IS NULL OR checksum = '');
UPDATE _migrations SET checksum = 'acd546a00a8aa4b92d6f49c43a7a42f8649030c48a7655ea31eb07c18e221cba' WHERE name = '0008_areas_optional.sql' AND (checksum IS NULL OR checksum = '');
UPDATE _migrations SET checksum = '9359f6e52260fee9e33e99a97a5d8ae008f9c32689fc3eda2863fbbba35e9a77' WHERE name = '0009_format_profiles.sql' AND (checksum IS NULL OR checksum = '');
UPDATE _migrations SET checksum = '2780e56ade89cc0a531e0595ae97a2cdd4b8d45f3e7258520652d7fa76477271' WHERE name = '0010_import_history.sql' AND (checksum IS NULL OR checksum = '');
UPDATE _migrations SET checksum = '1c8521db1c942187cb05296bc2d123f35219f96c4dfcf6595feb10385fa32c14' WHERE name = '0011_import_idempotency.sql' AND (checksum IS NULL OR checksum = '');
UPDATE _migrations SET checksum = 'b80696f00fb7eed8bf9ebb017e8801280531cde89d6c474f5a1a4c725274712c' WHERE name = '0012_format_profiles_structurehash_uniqueness.sql' AND (checksum IS NULL OR checksum = '');
UPDATE _migrations SET checksum = 'f092bf21244610e4b382ba85bcd4fe4d55ef9dbf01d9ccd3eea4b2bce57618c0' WHERE name = '0013_membership_roles_owner.sql' AND (checksum IS NULL OR checksum = '');
UPDATE _migrations SET checksum = '6323091e89eeb336947ae60ff6d9ec4468b08767b9bbb6b920e6624e8662282d' WHERE name = '0014_single_owner_per_organization.sql' AND (checksum IS NULL OR checksum = '');
UPDATE _migrations SET checksum = 'd8ea224ed6b5575819eca7c4c47b2d1f5015c58e36fcb727ec98f3526ee7a87a' WHERE name = '0015_membership_scoped_area.sql' AND (checksum IS NULL OR checksum = '');
UPDATE _migrations SET checksum = 'c3254bc0a105f9e75d92d86fc24c8a5d17b8d3c82ad7953f32f7b2c80e897cd9' WHERE name = '0016_organization_audit_events.sql' AND (checksum IS NULL OR checksum = '');
UPDATE _migrations SET checksum = '6ad8030d694274548a35b89745b368e598da85a009526993ec5ac50fc0a66694' WHERE name = '0017_schedules.sql' AND (checksum IS NULL OR checksum = '');
UPDATE _migrations SET checksum = 'd32a7bf152f1778b9a6082aaab3c29d7640fadc0d7403bca9690ff930dd11cf2' WHERE name = '0018_schedule_versions.sql' AND (checksum IS NULL OR checksum = '');
UPDATE _migrations SET checksum = '233482e8a48745aba28a3f18d09f4f12e8189c3c59264bed8771a30645d5a31e' WHERE name = '0019_shift_assignments.sql' AND (checksum IS NULL OR checksum = '');
UPDATE _migrations SET checksum = 'ab074c080f8138d1172823f4936f167be405bef29a314e50414176560028a5e0' WHERE name = '0020_shifts_schedule_version.sql' AND (checksum IS NULL OR checksum = '');
UPDATE _migrations SET checksum = '5f1c9d4ff8a3d09784f524a052b66ec66bc2c8260166fd8cdab6a07f8e486f6e' WHERE name = '0021_shift_assignments_import_id.sql' AND (checksum IS NULL OR checksum = '');
UPDATE _migrations SET checksum = '7612ac3aa7dc11c29d89a73ee427bb86dd263c917a89d102a8e8d657768aac04' WHERE name = '0022_shift_acknowledgements.sql' AND (checksum IS NULL OR checksum = '');
UPDATE _migrations SET checksum = 'f9b180e92a4cf231557596f5b5c889e9c9f324523dd52ceae8c5e3d83065aa25' WHERE name = '0023_shift_comments.sql' AND (checksum IS NULL OR checksum = '');
UPDATE _migrations SET checksum = 'c164df95e5c2083afe2bc336bc8507ff51f9ac896d8b73c66984bb7eb43406ef' WHERE name = '0024_change_requests.sql' AND (checksum IS NULL OR checksum = '');
UPDATE _migrations SET checksum = 'f87305d25ed431d3deb09b783bea0fa3654b1b42924e1bc93031b1dabaef88e6' WHERE name = '0025_notifications.sql' AND (checksum IS NULL OR checksum = '');
UPDATE _migrations SET checksum = '35a1b23a118258cfdcecf6699dfecbdacbb54a7f57f76027acad472e1c39ec8b' WHERE name = '0026_oauth_identities.sql' AND (checksum IS NULL OR checksum = '');
UPDATE _migrations SET checksum = 'a0482696c41314224a2ce3b5a93326f8740300788883505430329b68e0cbd492' WHERE name = '0027_approval_policy.sql' AND (checksum IS NULL OR checksum = '');
UPDATE _migrations SET checksum = 'a2c38221fb963747fded998312fae6367c76b4ebde4345de7b15bec896e2c2dc' WHERE name = '0028_approval_requests.sql' AND (checksum IS NULL OR checksum = '');
UPDATE _migrations SET checksum = '2fbf8aa6416075cd9c25a28b561d0008831970ea5514cc7ff49a44ee62005b6c' WHERE name = '0029_approval_decision_metadata.sql' AND (checksum IS NULL OR checksum = '');
UPDATE _migrations SET checksum = '8ea716f7892415a3d3b39e4762d7edf3628ddd17d2ea273c1aebe5fe3a789867' WHERE name = '0030_approval_rejection_metadata.sql' AND (checksum IS NULL OR checksum = '');
UPDATE _migrations SET checksum = '4aa67a5fb7a59669c5f57c8c342e6d15d639067e3ac419dc9efc120b2818208a' WHERE name = '0031_approval_audit_event_types.sql' AND (checksum IS NULL OR checksum = '');
UPDATE _migrations SET checksum = 'ee5650fce3b9e3753df456eaac7ddacf19f262c09431f56498552d3d3f3ab5af' WHERE name = '0032_change_request_application.sql' AND (checksum IS NULL OR checksum = '');
UPDATE _migrations SET checksum = 'e2f0682d08cd86d5a1618d6f3c914dc334d284073408588b594188a9d9ea27de' WHERE name = '0033_import_outcome.sql' AND (checksum IS NULL OR checksum = '');
UPDATE _migrations SET checksum = 'da29372254c5638f3ad48aef3620b95a69399e467621ef8640fef8be00df3b5c' WHERE name = '0034_shift_type_semantics.sql' AND (checksum IS NULL OR checksum = '');
UPDATE _migrations SET checksum = 'a13922dc2e46ac799983d271aa4a0a634fc3fa50082174c94920a3c46395972d' WHERE name = '0035_operational_assignments.sql' AND (checksum IS NULL OR checksum = '');
UPDATE _migrations SET checksum = '497933864957965f7605e62027467281da095c14aa67e476077e456b30da6f93' WHERE name = '0036_temporal_organizational_model.sql' AND (checksum IS NULL OR checksum = '');
UPDATE _migrations SET checksum = '9cf3769c61583247af29aa571c21fe26f8af712a84228cdf3f2a7d5fb9ff2485' WHERE name = '0037_temporal_ownership_transfer_and_labor_integrity.sql' AND (checksum IS NULL OR checksum = '');

ALTER TABLE _migrations
  ADD CONSTRAINT migrations_checksum_format_check
  CHECK (checksum ~ '^[0-9a-f]{64}$');

ALTER TABLE _migrations
  ALTER COLUMN checksum SET NOT NULL;

COMMIT;
