import path from 'node:path';

const here = __dirname;

/** Repo root (qa/e2e-acceptance/helpers → repo). */
export const REPO_ROOT = path.resolve(here, '..', '..', '..');

/** Fixture root for the acceptance corpus. */
export const FIXTURE_ROOT = path.join(REPO_ROOT, 'src', 'ingestion', 'fixtures', 'acceptance-corpus', 'fixtures');

/** Per-case evidence root. */
export const ARTIFACTS_ROOT = path.resolve(here, '..', 'artifacts');

export const TARGET_URL =
  'https://anclora-shiftimport-git-development-pmi140979-6354s-projects.vercel.app';

export const SHIFTS_STORAGE_KEY = 'anclora_shifts_v1';

/** Keys cleared between cases for determinism. */
export const CLEARED_KEYS = [
  SHIFTS_STORAGE_KEY,
  'anclora_shiftimport_profile_v1',
  'anclora_shiftimport_shift_types_v1',
  'anclora_shiftimport_format_profiles_v1',
];
