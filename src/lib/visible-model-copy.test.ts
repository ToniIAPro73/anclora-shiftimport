import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { translate } from './i18n';

/**
 * Visible model: Calendario · Planificación · Importar · Diferencias · Historial.
 * INTERNAL DOMAIN LANGUAGE != USER-FACING LANGUAGE — the internal vocabulary lives in code/DB/API/contracts only.
 */
const source = readFileSync(new URL('./i18n.ts', import.meta.url), 'utf8');
const literals = [...source.matchAll(/'((?:[^'\\\n]|\\.)*)'/g)].map((m) => m[1]);

const FORBIDDEN = [
  /plan empresa/i, /company plan/i, /baseline/i, /calendario efectivo/i, /effective calendar/i,
  /reconciliaci[oó]n/i, /reconciliation/i, /REQUIRES_REVIEW/, /KEPT_LOCAL/, /COMPANY_ADOPTED_LOCAL/, /EVIDENCE_APPLIED/,
  /primera referencia/i, /referencia inicial/i, /initial company reference/i, /initial reference/i,
  /revisi[oó]n del plan/i, /plan revision/i, /antes comunicado/i, /ahora comunicado/i, /actualizaci[oó]n \d/i,
  /COMPANY_PLAN/, /ScheduleVersion/, /ShiftAssignment/, /revision_number/, /fingerprint/i,
];

describe('user-facing vocabulary (ES + EN)', () => {
  it('T4/T5: no internal domain term appears in any visible string', () => {
    const leaks = literals.filter((value) => FORBIDDEN.some((re) => re.test(value)));
    expect(leaks).toEqual([]);
  });

  it('T1/T2: there is no first-reference / baseline flow in the visible copy', () => {
    for (const key of ['planBaselineTitle', 'planBaselineCreate', 'planBaselineIntro', 'planBaselineIntroOther']) {
      expect(translate('es', `importModal.${key}`)).toBe(`importModal.${key}`);
      expect(translate('en', `importModal.${key}`)).toBe(`importModal.${key}`);
    }
  });

  it('T3: differences are source-neutral — previous / new information vs the current calendar', () => {
    expect(translate('es', 'reconModal.title')).toBe('Diferencias');
    expect(translate('es', 'reconModal.colBefore')).toBe('Información anterior');
    expect(translate('es', 'reconModal.colNow')).toBe('Nueva información');
    expect(translate('es', 'reconModal.colEffective')).toBe('Calendario actual');
    expect(translate('en', 'reconModal.colEffective')).toBe('Current calendar');
    expect(translate('es', 'dayHistory.pendingTitle')).toBe('Diferencia pendiente');
    expect(translate('es', 'dayHistory.keepLabel')).toBe('Elige el calendario del día');
    expect(translate('es', 'dayHistory.reconcile')).toBe('Guardar decisión');
  });

  it('T6–T8: the three real documents are named plainly', () => {
    expect(translate('es', 'importModal.sourceKind.PUBLISHED_CALENDAR_EXPORT')).toBe('Mensual publicado');
    expect(translate('es', 'importModal.sourceKind.EMPLOYEE_CALENDAR_EXPORT')).toBe('Calendario del empleado');
    expect(translate('es', 'importModal.sourceKind.TEAM_SCHEDULE_EXPORT')).toBe('Cuadrante de empresa');
    expect(translate('es', 'importModal.sourceDescription.EMPLOYEE_CALENDAR_EXPORT')).toBe('Calendario individual con información adicional como incidencias y observaciones.');
    expect(translate('es', 'importModal.sourceDescription.PUBLISHED_CALENDAR_EXPORT')).toBe('Calendario individual publicado del empleado.');
    expect(translate('es', 'importModal.sourceDescription.TEAM_SCHEDULE_EXPORT')).toBe('Contiene turnos de uno o varios empleados.');
  });

  it('T9: future shifts go to Planning as a draft and are never published automatically', () => {
    expect(translate('es', 'importModal.sourceUsageFuture')).toContain('No se publicarán automáticamente');
    expect(translate('es', 'importModal.planDraftNote')).toContain('no se publican automáticamente');
    expect(translate('es', 'importModal.planOptionHistoricalAndPlan')).toBe('Importar anteriores y añadir los futuros a Planificación');
  });

  it('T10: history events are phrased as happenings, not revision numbers', () => {
    expect(translate('es', 'imports.kindPlanInitial')).toBe('Cuadrante de empresa importado');
    expect(translate('es', 'importResult.planRevisionCreated', { revision: 17 })).not.toMatch(/17|revisi/i);
    expect(translate('es', 'dayHistory.changeTypes.RECONCILIATION')).toBe('Diferencia resuelta');
  });
});
