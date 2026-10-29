import { FormEvent, useEffect, useMemo, useState } from 'react';
import { hoursToMinutes, splitMinutes } from '../../lib/effective-calendar.js';
import { createWorktimeTargetVersion, loadWorktimeTargets, type RemoteAnnualTarget } from '../../lib/remote';
import { getAllShiftTypesForManagement, getShiftTypeSemantics } from '../../lib/shift-types';
import { useI18n } from '../../lib/use-i18n';
import { ModalShell } from '../ui/ModalShell';
import './EffectiveStatsPanel.css';

interface AnnualTargetModalProps {
  isOpen: boolean;
  onClose: () => void;
  employeeId: string;
  employeeName: string;
  year: number;
  current: RemoteAnnualTarget | null;
  canEdit: boolean;
  onSaved: (target: RemoteAnnualTarget) => void;
}

const toHoursText = (minutes: number): string => {
  const { hours, minutes: mins } = splitMinutes(minutes);
  return mins === 0 ? String(hours) : (minutes / 60).toFixed(2);
};

const parseHours = (value: string): number | null => {
  const normalized = value.trim().replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  return hoursToMinutes(Number(normalized));
};

const localDate = () => {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
};

const periodEndFor = (periodType: string, start: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return start;
  const date = new Date(`${start}T00:00:00.000Z`);
  if (periodType === 'ANNUAL') return `${start.slice(0, 4)}-12-31`;
  if (periodType === 'MONTHLY') return `${start.slice(0, 7)}-${String(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()).padStart(2, '0')}`;
  if (periodType === 'WEEKLY') {
    date.setUTCDate(date.getUTCDate() + 6);
    return date.toISOString().slice(0, 10);
  }
  return start;
};

/** Per employee AND per year annual working-time range (OWNER/ADMIN write). */
export function AnnualTargetModal({
  isOpen, onClose, employeeId, employeeName, year, current, canEdit, onSaved,
}: AnnualTargetModalProps) {
  const { t } = useI18n();
  const [minimum, setMinimum] = useState('');
  const [maximum, setMaximum] = useState('');
  const [notes, setNotes] = useState('');
  const [includedShiftTypes, setIncludedShiftTypes] = useState<string[]>(['Regular']);
  const [targetKind, setTargetKind] = useState<'CONTRACTUAL' | 'OPERATIONAL'>('CONTRACTUAL');
  const [periodType, setPeriodType] = useState<'ANNUAL' | 'WEEKLY' | 'MONTHLY' | 'CUSTOM'>('ANNUAL');
  const [periodStart, setPeriodStart] = useState(`${year}-01-01`);
  const [periodEnd, setPeriodEnd] = useState(`${year}-12-31`);
  const [effectiveFrom, setEffectiveFrom] = useState(localDate());
  const [target, setTarget] = useState('');
  const [history, setHistory] = useState<RemoteAnnualTarget[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setMinimum(current ? toHoursText(current.minimumAnnualMinutes) : '');
    setMaximum(current ? toHoursText(current.maximumAnnualMinutes) : '');
    setNotes(current?.notes ?? '');
    setIncludedShiftTypes(current?.includedShiftTypes?.length ? current.includedShiftTypes : ['Regular']);
    setTargetKind(current?.targetKind ?? 'CONTRACTUAL');
    setPeriodType(current?.periodType ?? 'ANNUAL');
    setPeriodStart(current?.periodStart ?? `${year}-01-01`);
    setPeriodEnd(current?.periodEnd ?? `${year}-12-31`);
    setEffectiveFrom(localDate());
    setTarget(current?.targetMinutes ? toHoursText(current.targetMinutes) : '');
    setError(null);
    loadWorktimeTargets(employeeId, { history: true }).then(setHistory).catch(() => setHistory([]));
  }, [isOpen, current, employeeId, year]);

  const minimumMinutes = parseHours(minimum);
  const maximumMinutes = parseHours(maximum);
  const margin = useMemo(() => (
    minimumMinutes !== null && maximumMinutes !== null && maximumMinutes >= minimumMinutes
      ? maximumMinutes - minimumMinutes
      : null
  ), [minimumMinutes, maximumMinutes]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (minimumMinutes === null || maximumMinutes === null) {
      setError(t('annualTarget.invalidNumber'));
      return;
    }
    if (maximumMinutes < minimumMinutes) {
      setError(t('annualTarget.invalidRange'));
      return;
    }
    if (includedShiftTypes.length === 0) {
      setError(t('annualTarget.invalidTypes'));
      return;
    }
    const targetMinutes = target.trim() === '' ? null : parseHours(target);
    if (target.trim() !== '' && (targetMinutes === null || targetMinutes < minimumMinutes || targetMinutes > maximumMinutes)) {
      setError(t('annualTarget.invalidCenter'));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const saved = await createWorktimeTargetVersion({
        employeeId, targetKind, periodType, periodStart, periodEnd,
        minimumMinutes, targetMinutes, maximumMinutes, effectiveFrom,
        includedWorkBuckets: includedShiftTypes, notes,
      });
      onSaved(saved);
      onClose();
    } catch {
      setError(t('annualTarget.saveError'));
    } finally {
      setSaving(false);
    }
  };

  const marginText = margin === null
    ? '—'
    : (() => {
      const { hours, minutes } = splitMinutes(margin);
      return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`;
    })();

  const workTypes = getAllShiftTypesForManagement().filter((type) => (
    getShiftTypeSemantics(type.id).contributesWorkedTime || includedShiftTypes.includes(type.id)
  ));
  const knownTypeIds = new Set(workTypes.map((type) => type.id));
  const displayedTypes = [
    ...workTypes,
    ...includedShiftTypes.filter((typeId) => !knownTypeIds.has(typeId)).map((id) => ({ id, label: id })),
  ];

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title={t('annualTarget.title')}
      closeAriaLabel={t('teamWorkspace.close')}
      closeTestId="close-annual-target-modal"
      maxWidth="460px"
      width="min(94vw, 460px)"
    >
      <form className="eff-form" onSubmit={(event) => void handleSubmit(event)} data-testid="annual-target-form">
        <p className="eff-form__intro">{t('annualTarget.description', { name: employeeName })}</p>
        {!canEdit && <p role="note" className="eff-form__note">{t('annualTarget.readOnly')}</p>}
        <label className="eff-form__field"><span>{t('annualTarget.kindLabel')}</span>
          <select value={targetKind} onChange={(event) => setTargetKind(event.target.value as typeof targetKind)} disabled={!canEdit || saving}>
            <option value="CONTRACTUAL">{t('annualTarget.contractual')}</option><option value="OPERATIONAL">{t('annualTarget.operational')}</option>
          </select>
        </label>
        <label className="eff-form__field"><span>{t('annualTarget.periodLabel')}</span>
          <select value={periodType} onChange={(event) => {
            const next = event.target.value as typeof periodType;
            setPeriodType(next);
            if (next === 'ANNUAL') {
              const start = `${periodStart.slice(0, 4)}-01-01`;
              setPeriodStart(start);
              setPeriodEnd(periodEndFor(next, start));
            } else if (next === 'MONTHLY') {
              const start = `${periodStart.slice(0, 7)}-01`;
              setPeriodStart(start);
              setPeriodEnd(periodEndFor(next, start));
            } else if (next === 'WEEKLY') setPeriodEnd(periodEndFor(next, periodStart));
          }} disabled={!canEdit || saving}>
            <option value="ANNUAL">{t('annualTarget.annual')}</option><option value="WEEKLY">{t('annualTarget.weekly')}</option>
            <option value="MONTHLY">{t('annualTarget.monthly')}</option><option value="CUSTOM">{t('annualTarget.custom')}</option>
          </select>
        </label>
        <div className="eff-form__field">
          <span>{t('annualTarget.periodDates')}</span>
          <div className="eff-form__inline-fields">
            <input aria-label={t('annualTarget.periodStart')} type="date" value={periodStart} onChange={(event) => {
              const requested = event.target.value;
              const nextStart = periodType === 'ANNUAL' ? `${requested.slice(0, 4)}-01-01`
                : periodType === 'MONTHLY' ? `${requested.slice(0, 7)}-01` : requested;
              setPeriodStart(nextStart);
              if (periodType !== 'CUSTOM') setPeriodEnd(periodEndFor(periodType, nextStart));
            }} disabled={!canEdit || saving} />
            <input aria-label={t('annualTarget.periodEnd')} type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} disabled={!canEdit || saving || periodType !== 'CUSTOM'} />
          </div>
        </div>
        <label className="eff-form__field"><span>{t('annualTarget.effectiveFrom')}</span>
          <input type="date" value={effectiveFrom} onChange={(event) => setEffectiveFrom(event.target.value)} disabled={!canEdit || saving} />
        </label>
        <label className="eff-form__field">
          <span>{t('annualTarget.minimumLabel')}</span>
          <input
            inputMode="decimal"
            value={minimum}
            onChange={(event) => setMinimum(event.target.value)}
            disabled={!canEdit || saving}
            data-testid="annual-target-minimum"
          />
        </label>
        <label className="eff-form__field"><span>{t('annualTarget.targetLabel')}</span>
          <input inputMode="decimal" value={target} onChange={(event) => setTarget(event.target.value)} disabled={!canEdit || saving} />
        </label>
        <label className="eff-form__field">
          <span>{t('annualTarget.maximumLabel')}</span>
          <input
            inputMode="decimal"
            value={maximum}
            onChange={(event) => setMaximum(event.target.value)}
            disabled={!canEdit || saving}
            data-testid="annual-target-maximum"
          />
        </label>
        <p className="eff-form__margin" data-testid="annual-target-margin">
          {t('annualTarget.marginLabel')}: <strong>{marginText}</strong>
        </p>
        <fieldset className="eff-form__field" disabled={!canEdit || saving}>
          <legend>{t('annualTarget.includedTypesLabel')}</legend>
          <p className="eff-form__note">{t('annualTarget.includedTypesHelp')}</p>
          <div className="annual-target__shift-types">
            {displayedTypes.map((type) => (
              <label key={type.id} className="annual-target__shift-type">
                <input
                  type="checkbox"
                  checked={includedShiftTypes.includes(type.id)}
                  onChange={(event) => setIncludedShiftTypes((currentTypes) => (
                    event.target.checked
                      ? [...currentTypes, type.id]
                      : currentTypes.filter((currentType) => currentType !== type.id)
                  ))}
                  data-testid={`annual-target-type-${type.id}`}
                />
                <span>{type.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <label className="eff-form__field">
          <span>{t('annualTarget.notesLabel')}</span>
          <textarea
            value={notes}
            maxLength={2000}
            rows={2}
            onChange={(event) => setNotes(event.target.value)}
            disabled={!canEdit || saving}
          />
        </label>
        {history.length > 0 && <section className="annual-target__history" aria-label={t('annualTarget.history')}>
          <h3>{t('annualTarget.history')}</h3>
          <ul>{history.map((item) => <li key={item.id}>
            <strong>{t(item.targetKind === 'OPERATIONAL' ? 'annualTarget.operational' : 'annualTarget.contractual')}</strong>
            <span>{item.periodStart} – {item.periodEnd}</span>
            <span>{t('annualTarget.effectiveVersion', { date: item.effectiveFrom, revision: item.revision })}</span>
            <span>{toHoursText(item.minimumMinutes)}–{toHoursText(item.maximumMinutes)} h</span>
            {item.targetMinutes !== null && item.targetMinutes !== item.minimumMinutes && item.targetMinutes !== item.maximumMinutes
              && <span>{t('annualTarget.centerTarget', { hours: toHoursText(item.targetMinutes) })}</span>}
            <span>{t('annualTarget.countingPolicy', { buckets: item.includedWorkBuckets.join(', ') })}</span>
            <span>{t('annualTarget.versionSource', { source: t(`annualTarget.source${item.source === 'IMPORT' ? 'Import' : item.source === 'MIGRATION' ? 'Migration' : item.source === 'SYSTEM' ? 'System' : 'Admin'}`) })}</span>
            {item.notes && <span>{item.notes}</span>}
          </li>)}</ul>
        </section>}
        {error && <p role="alert" className="eff-form__error">{error}</p>}
        <div className="eff-form__actions">
          <button type="button" className="eff-button" onClick={onClose} disabled={saving}>
            {t('annualTarget.cancel')}
          </button>
          {canEdit && (
            <button type="submit" className="eff-button eff-button--primary" disabled={saving} data-testid="annual-target-save">
              {saving ? t('annualTarget.saving') : t('annualTarget.save')}
            </button>
          )}
        </div>
      </form>
    </ModalShell>
  );
}
