import { FormEvent, useEffect, useMemo, useState } from 'react';
import { hoursToMinutes, splitMinutes } from '../../lib/effective-calendar.js';
import { saveAnnualTarget, type RemoteAnnualTarget } from '../../lib/remote';
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

/** Per employee AND per year annual working-time range (OWNER/ADMIN write). */
export function AnnualTargetModal({
  isOpen, onClose, employeeId, employeeName, year, current, canEdit, onSaved,
}: AnnualTargetModalProps) {
  const { t } = useI18n();
  const [minimum, setMinimum] = useState('');
  const [maximum, setMaximum] = useState('');
  const [notes, setNotes] = useState('');
  const [includedShiftTypes, setIncludedShiftTypes] = useState<string[]>(['Regular']);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setMinimum(current ? toHoursText(current.minimumAnnualMinutes) : '');
    setMaximum(current ? toHoursText(current.maximumAnnualMinutes) : '');
    setNotes(current?.notes ?? '');
    setIncludedShiftTypes(current?.includedShiftTypes?.length ? current.includedShiftTypes : ['Regular']);
    setError(null);
  }, [isOpen, current]);

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
    setSaving(true);
    setError(null);
    try {
      const saved = await saveAnnualTarget({
        employeeId, year, minimumAnnualMinutes: minimumMinutes, maximumAnnualMinutes: maximumMinutes,
        includedShiftTypes, notes,
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
        <label className="eff-form__field">
          <span>{t('annualTarget.yearLabel')}</span>
          <input type="number" value={year} readOnly aria-readonly="true" />
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
