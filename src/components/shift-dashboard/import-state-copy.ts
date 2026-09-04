import type { CSSProperties } from 'react';
import type { ImportState } from '../../ingestion/diagnostics';

/**
 * Single source of truth for how an ImportState is labeled/colored in the
 * UI. Shared by ImportModal and TeamImportModal so both diagnosis panels
 * render the same chip for the same state — no per-component taxonomy.
 */
export const STATE_I18N_KEYS: Record<ImportState, string> = {
  READY: 'diagnosis.stateReady',
  NEEDS_USER_INPUT: 'diagnosis.stateNeedsInput',
  PARTIAL: 'diagnosis.statePartial',
  BLOCKED: 'diagnosis.stateBlocked',
  UNSUPPORTED: 'diagnosis.stateUnsupported',
  FAILED: 'diagnosis.stateFailed',
};

export const STATE_CHIP_STYLES: Record<ImportState, CSSProperties> = {
  READY: { background: 'var(--info-bg)', border: '1px solid var(--info-border)', color: 'var(--color-accent)' },
  NEEDS_USER_INPUT: { background: 'var(--gold-tint-bg)', border: '1px solid var(--color-gold)', color: 'var(--color-gold)' },
  PARTIAL: { background: 'var(--gold-tint-bg)', border: '1px solid var(--color-gold)', color: 'var(--color-gold)' },
  BLOCKED: { background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', color: 'var(--danger)' },
  UNSUPPORTED: { background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', color: 'var(--danger)' },
  FAILED: { background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', color: 'var(--danger)' },
};
