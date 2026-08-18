import { describe, expect, it } from 'vitest';
import { setupLocalStorageMock } from '../test-utils/local-storage';
import {
  completeOnboarding,
  loadOnboarding,
  resetOnboarding,
  saveOnboardingStep,
  shouldShowOnboarding,
} from './onboarding';

setupLocalStorageMock();

describe('onboarding', () => {
  it('a first user (no record, no shifts) sees the onboarding', () => {
    expect(loadOnboarding()).toEqual({ version: 1, completed: false, step: 'NEW_USER' });
    expect(shouldShowOnboarding(0)).toBe(true);
  });

  it('a returning user with shifts but no record is treated as completed, and that is persisted', () => {
    expect(shouldShowOnboarding(12)).toBe(false);
    const record = loadOnboarding();
    expect(record.completed).toBe(true);
    expect(record.step).toBe('CONFIRMED');
    expect(record.completedAt).toBeDefined();
    // and stays hidden afterwards
    expect(shouldShowOnboarding(12)).toBe(false);
  });

  it('stays hidden after completeOnboarding()', () => {
    expect(shouldShowOnboarding(0)).toBe(true);
    completeOnboarding();
    expect(shouldShowOnboarding(0)).toBe(false);
    expect(loadOnboarding().completedAt).toBeDefined();
  });

  it('resetOnboarding() re-enables the guide explicitly', () => {
    completeOnboarding();
    expect(shouldShowOnboarding(0)).toBe(false);
    resetOnboarding();
    expect(loadOnboarding()).toEqual({ version: 1, completed: false, step: 'NEW_USER' });
    expect(shouldShowOnboarding(0)).toBe(true);
  });

  it('persists intermediate steps without completing the flow', () => {
    saveOnboardingStep('DOCUMENT_ANALYZING');
    expect(loadOnboarding().step).toBe('DOCUMENT_ANALYZING');
    expect(loadOnboarding().completed).toBe(false);
    // still shown until completed
    expect(shouldShowOnboarding(0)).toBe(true);
  });

  it('falls back to the default record on corrupted storage', () => {
    localStorage.setItem('anclora_shiftimport_onboarding_v1', '{broken json');
    expect(loadOnboarding()).toEqual({ version: 1, completed: false, step: 'NEW_USER' });
  });
});
