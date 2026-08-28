import { describe, expect, it } from 'vitest';
import { ImportResult, ImportQualityState } from '../lib/import-quality';
import { DocumentKind } from './parsers/file';
import { ImportState } from './diagnostics';
import { classifyVlmTrigger } from './vlm-trigger';

const quality = (state: ImportQualityState, shiftCount: number): ImportResult => ({
  shifts: Array.from({ length: shiftCount }, () => ({
    date: '2026-08-01',
    startTime: '08:00',
    endTime: '16:00',
    isValid: true,
    confidence: 0.9,
    rawText: '08:00-16:00',
  })),
  confidence: state === 'CORRECT' ? 1 : state === 'REVIEW' ? 0.6 : 0.1,
  warnings: [],
  state,
});

const base = {
  kind: 'pdf' as DocumentKind,
  itemCount: 120,
  quality: quality('CORRECT', 5),
  authenticated: true,
};

describe('classifyVlmTrigger', () => {
  describe('structured formats are never eligible', () => {
    it.each(['csv', 'excel', 'text', 'unknown'] as DocumentKind[])(
      'rejects %s even with empty items and an unrecognized result',
      (kind) => {
        expect(classifyVlmTrigger({
          ...base,
          kind,
          itemCount: 0,
          quality: quality('UNRECOGNIZED', 0),
          diagnosisState: 'BLOCKED',
        })).toEqual({ kind: 'VLM_NOT_ELIGIBLE', reason: 'structured-format' });
      },
    );
  });

  describe('guests are never eligible', () => {
    it('rejects unauthenticated pdf even with empty items', () => {
      expect(classifyVlmTrigger({ ...base, authenticated: false, itemCount: 0 }))
        .toEqual({ kind: 'VLM_NOT_ELIGIBLE', reason: 'unauthenticated' });
    });

    it('rejects unauthenticated image with an unrecognized result', () => {
      expect(classifyVlmTrigger({
        ...base,
        kind: 'image',
        authenticated: false,
        quality: quality('UNRECOGNIZED', 0),
      })).toEqual({ kind: 'VLM_NOT_ELIGIBLE', reason: 'unauthenticated' });
    });
  });

  describe('eligibility', () => {
    it('empty-items: no text items were extracted', () => {
      expect(classifyVlmTrigger({ ...base, itemCount: 0 }))
        .toEqual({ kind: 'VLM_ELIGIBLE', reason: 'empty-items' });
      expect(classifyVlmTrigger({ ...base, kind: 'image', itemCount: 0 }))
        .toEqual({ kind: 'VLM_ELIGIBLE', reason: 'empty-items' });
    });

    it('unrecognized: UNRECOGNIZED quality with zero shifts', () => {
      expect(classifyVlmTrigger({ ...base, quality: quality('UNRECOGNIZED', 0) }))
        .toEqual({ kind: 'VLM_ELIGIBLE', reason: 'unrecognized' });
    });

    it('blocked-diagnosis: BLOCKED or UNSUPPORTED canonical state', () => {
      const usable = quality('REVIEW', 3);
      expect(classifyVlmTrigger({ ...base, quality: usable, diagnosisState: 'BLOCKED' as ImportState }))
        .toEqual({ kind: 'VLM_ELIGIBLE', reason: 'blocked-diagnosis' });
      expect(classifyVlmTrigger({ ...base, quality: usable, diagnosisState: 'UNSUPPORTED' as ImportState }))
        .toEqual({ kind: 'VLM_ELIGIBLE', reason: 'blocked-diagnosis' });
    });
  });

  describe('reliable deterministic results are never re-analyzed', () => {
    it('CORRECT with records is a reliable result', () => {
      expect(classifyVlmTrigger({ ...base, quality: quality('CORRECT', 5) }))
        .toEqual({ kind: 'VLM_NOT_ELIGIBLE', reason: 'reliable-result' });
    });

    it('REVIEW with records stands as the deterministic result', () => {
      expect(classifyVlmTrigger({ ...base, quality: quality('REVIEW', 5) }))
        .toEqual({ kind: 'DETERMINISTIC_OK' });
    });

    it('UNRECOGNIZED with some shifts is not re-analyzed either', () => {
      expect(classifyVlmTrigger({ ...base, quality: quality('UNRECOGNIZED', 2) }))
        .toEqual({ kind: 'DETERMINISTIC_OK' });
    });

    it.each(['READY', 'NEEDS_USER_INPUT', 'PARTIAL', 'FAILED'] as ImportState[])(
      'non-dead-end diagnosis state %s does not trigger the fallback',
      (diagnosisState) => {
        expect(classifyVlmTrigger({ ...base, quality: quality('REVIEW', 3), diagnosisState }))
          .toEqual({ kind: 'DETERMINISTIC_OK' });
      },
    );

    it('CORRECT with zero records is not "reliable" (falls through to DETERMINISTIC_OK)', () => {
      // No UNRECOGNIZED flag and no blocked diagnosis → nothing to rescue,
      // but also no records to trust.
      expect(classifyVlmTrigger({ ...base, quality: quality('CORRECT', 0) }))
        .toEqual({ kind: 'DETERMINISTIC_OK' });
    });
  });

  describe('rule precedence', () => {
    it('structured-format beats unauthenticated', () => {
      expect(classifyVlmTrigger({ ...base, kind: 'csv', authenticated: false, itemCount: 0 }))
        .toEqual({ kind: 'VLM_NOT_ELIGIBLE', reason: 'structured-format' });
    });

    it('unauthenticated beats empty-items', () => {
      expect(classifyVlmTrigger({ ...base, kind: 'image', authenticated: false, itemCount: 0 }))
        .toEqual({ kind: 'VLM_NOT_ELIGIBLE', reason: 'unauthenticated' });
    });

    it('empty-items beats unrecognized/blocked (no items at all is the strongest signal)', () => {
      expect(classifyVlmTrigger({
        ...base,
        itemCount: 0,
        quality: quality('UNRECOGNIZED', 0),
        diagnosisState: 'BLOCKED',
      })).toEqual({ kind: 'VLM_ELIGIBLE', reason: 'empty-items' });
    });
  });
});
