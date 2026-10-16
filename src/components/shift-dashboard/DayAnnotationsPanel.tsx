import { useEffect, useState } from 'react';
import { setDcfInterval, type DayAnnotation } from '../../lib/remote';
import { useI18n } from '../../lib/use-i18n';

interface DayAnnotationsPanelProps {
  employeeId: string;
  date: string;
  annotations: DayAnnotation[];
  /** OWNER / ADMIN / PLANNER within scope. EMPLOYEE never edits administrative incidences. */
  canEdit: boolean;
  onChanged?: () => void;
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * DCF ("Descanso Compensación Formación") and observations of one day. DCF is informational: it never changes
 * effective hours, and when the source did not state its hours they stay unknown (nothing is invented).
 */
export function DayAnnotationsPanel({ employeeId, date, annotations, canEdit, onChanged }: DayAnnotationsPanelProps) {
  const { t } = useI18n();
  const dcf = annotations.find((item) => item.kind === 'DCF') ?? null;
  const comments = annotations.filter((item) => item.kind === 'COMMENT');
  const [start, setStart] = useState(dcf?.startTime ?? '');
  const [end, setEnd] = useState(dcf?.endTime ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setStart(dcf?.startTime ?? '');
    setEnd(dcf?.endTime ?? '');
    setError(null);
  }, [dcf?.startTime, dcf?.endTime, date]);

  if (!dcf && comments.length === 0) return null;

  const save = async (clear = false) => {
    if (!clear && (!TIME_RE.test(start) || !TIME_RE.test(end))) {
      setError(t('annotations.invalidTimes'));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await setDcfInterval({ employeeId, date, startTime: clear ? null : start, endTime: clear ? null : end });
      onChanged?.();
    } catch {
      setError(t('annotations.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="day-detail-section" data-testid="day-annotations">
      {dcf && (
        <div className="day-annotation" data-testid="day-annotation-dcf">
          <h4 className="day-detail-section-title">{t('annotations.dcfTitle')}</h4>
          <p style={{ margin: '0 0 6px', color: 'var(--text-muted)' }}>{t('annotations.dcfName')}</p>
          <p style={{ margin: 0, fontWeight: 700 }} data-testid="day-annotation-dcf-hours">
            {dcf.completeness === 'HOURS_KNOWN' && dcf.startTime && dcf.endTime
              ? `${dcf.startTime}–${dcf.endTime}`
              : t('annotations.hoursUnknown')}
          </p>
          <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: 'var(--text-subtle)' }}>{t('annotations.dcfInformational')}</p>
          {canEdit && (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginTop: '8px' }}>
              <label style={{ display: 'grid', gap: '2px', fontSize: '0.74rem' }}>
                {t('annotations.from')}
                <input type="time" value={start} onChange={(event) => setStart(event.target.value)} data-testid="dcf-start" />
              </label>
              <label style={{ display: 'grid', gap: '2px', fontSize: '0.74rem' }}>
                {t('annotations.to')}
                <input type="time" value={end} onChange={(event) => setEnd(event.target.value)} data-testid="dcf-end" />
              </label>
              <button type="button" className="eff-button eff-button--primary" disabled={saving} onClick={() => void save(false)} data-testid="dcf-save">
                {t('annotations.saveHours')}
              </button>
              {dcf.completeness === 'HOURS_KNOWN' && (
                <button type="button" className="eff-button eff-button--ghost" disabled={saving} onClick={() => void save(true)}>
                  {t('annotations.clearHours')}
                </button>
              )}
            </div>
          )}
          {error && <p role="alert" style={{ color: 'var(--danger)', fontSize: '0.8rem' }}>{error}</p>}
        </div>
      )}
      {comments.length > 0 && (
        <div className="day-annotation" data-testid="day-annotation-comments" style={{ marginTop: dcf ? '12px' : 0 }}>
          <h4 className="day-detail-section-title">{t('annotations.commentsTitle')}</h4>
          {comments.map((comment) => (
            <p key={comment.id} style={{ margin: '0 0 6px' }}>
              {comment.text}
              <small style={{ marginLeft: '8px', color: 'var(--text-subtle)' }}>
                {comment.origin === 'IMPORT' ? t('annotations.originImport') : t('annotations.originManual')}
              </small>
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
