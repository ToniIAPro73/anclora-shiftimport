/**
 * Onboarding state — lightweight record, NOT a workflow engine.
 *
 * Tracks whether the first-run guide (fast onboarding, Phase 1A) has been
 * completed and which step the user is on, so the app can resume or skip it.
 * All navigation/branching logic lives in the UI layer; this module only
 * persists and answers "should the onboarding be shown".
 */

export type OnboardingStep =
  | 'NEW_USER'
  | 'DOCUMENT_SELECTED'
  | 'DOCUMENT_ANALYZING'
  | 'IDENTITY_REQUIRED'
  | 'MAPPING_REQUIRED'
  | 'PREVIEW_READY'
  | 'CONFIRMED';

export interface OnboardingRecord {
  version: 1;
  completed: boolean;
  completedAt?: string;
  step: OnboardingStep;
}

const ONBOARDING_STORAGE_KEY = 'anclora_shiftimport_onboarding_v1';

const hasLocalStorage = (): boolean => typeof localStorage !== 'undefined';

const DEFAULT_ONBOARDING: OnboardingRecord = {
  version: 1,
  completed: false,
  step: 'NEW_USER',
};

const STEPS: OnboardingStep[] = [
  'NEW_USER',
  'DOCUMENT_SELECTED',
  'DOCUMENT_ANALYZING',
  'IDENTITY_REQUIRED',
  'MAPPING_REQUIRED',
  'PREVIEW_READY',
  'CONFIRMED',
];

const normalizeRecord = (raw: Partial<OnboardingRecord> | null | undefined): OnboardingRecord => ({
  version: 1,
  completed: raw?.completed === true,
  completedAt: typeof raw?.completedAt === 'string' && raw.completedAt ? raw.completedAt : undefined,
  step: raw?.step && STEPS.includes(raw.step) ? raw.step : DEFAULT_ONBOARDING.step,
});

/** Raw stored record, or null when nothing has ever been persisted. */
const readStoredRecord = (): OnboardingRecord | null => {
  if (!hasLocalStorage()) {
    return null;
  }
  const data = localStorage.getItem(ONBOARDING_STORAGE_KEY);
  if (!data) {
    return null;
  }
  try {
    return normalizeRecord(JSON.parse(data) as Partial<OnboardingRecord>);
  } catch (e) {
    console.error('Failed to parse onboarding state from storage', e);
    return null;
  }
};

const persistRecord = (record: OnboardingRecord): void => {
  if (!hasLocalStorage()) {
    return;
  }
  localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(normalizeRecord(record)));
};

export const loadOnboarding = (): OnboardingRecord =>
  readStoredRecord() ?? { ...DEFAULT_ONBOARDING };

export const saveOnboardingStep = (step: OnboardingStep): OnboardingRecord => {
  const record = { ...loadOnboarding(), step };
  persistRecord(record);
  return record;
};

export const completeOnboarding = (): OnboardingRecord => {
  const record: OnboardingRecord = {
    version: 1,
    completed: true,
    completedAt: new Date().toISOString(),
    step: 'CONFIRMED',
  };
  persistRecord(record);
  return record;
};

/** Explicit restart path (e.g. "replay the getting-started guide"). */
export const resetOnboarding = (): OnboardingRecord => {
  const record = { ...DEFAULT_ONBOARDING };
  persistRecord(record);
  return record;
};

/**
 * Whether the first-run guide should be shown:
 * - completed → never again.
 * - never completed → yes, with one exception: a returning user who already
 *   has shifts but no onboarding record predates this feature. Treat them as
 *   completed (and persist that) so existing users are NOT forced through
 *   onboarding.
 */
export const shouldShowOnboarding = (shiftCount: number): boolean => {
  const stored = readStoredRecord();
  if (stored?.completed) {
    return false;
  }
  if (stored === null && shiftCount > 0) {
    completeOnboarding();
    return false;
  }
  return true;
};
