import { useEffect, useMemo, useState } from 'react';
import { ArrowRightLeft, Check, CirclePlus, Lock, Minus } from 'lucide-react';
import { ModalShell } from '../ui/ModalShell';
import { translateShiftTypeLabel } from '../../lib/i18n';
import { useI18n } from '../../lib/use-i18n';
import {
  previewShiftOperation,
  type IncomingShiftInput,
  type OperationAvailability,
  type PreviewStatus,
  type ShiftContextPlan,
  type ShiftOperation,
} from '../../lib/shift-context';
import './ShiftContextDialog.css';

export interface ShiftContextConfirmation {
  operation: ShiftOperation;
  targetId: string | null;
  reason: string;
}

interface ShiftContextDialogProps {
  isOpen: boolean;
  date: string;
  employeeName: string;
  incoming: IncomingShiftInput;
  plan: ShiftContextPlan;
  /** Failure of the last confirmation, shown inside the dialog (it covers the page). */
  error?: string | null;
  onCancel: () => void;
  onConfirm: (confirmation: ShiftContextConfirmation) => Promise<void>;
}

const MAX_REASON = 2000;

const timeRange = (row: { startTime?: string | null; endTime?: string | null }) => (
  row.startTime && row.endTime ? `${String(row.startTime).slice(0, 5)}–${String(row.endTime).slice(0, 5)}` : ''
);

const STATUS_ICON: Record<PreviewStatus, typeof Lock> = { KEPT: Check, REPLACED: Minus, NEW: CirclePlus };

/**
 * "Ya existen asignaciones para este día": the user chooses Sustituir / Añadir, sees exactly what the day will look like and confirms.
 * The recommendation only preselects; it never writes. All validation is repeated by the server.
 */
export function ShiftContextDialog({ isOpen, date, employeeName, incoming, plan, error, onCancel, onConfirm }: ShiftContextDialogProps) {
  const { t, locale } = useI18n();
  const typeLabel = (type?: string | null) => translateShiftTypeLabel(type ?? '', locale, type ?? '');
  const initialOperation: ShiftOperation | null = plan.recommended ?? (plan.replace.allowed && !plan.add.allowed ? 'REPLACE' : plan.add.allowed && !plan.replace.allowed ? 'ADD' : null);
  const [operation, setOperation] = useState<ShiftOperation | null>(initialOperation);
  const [targetId, setTargetId] = useState<string | null>(plan.defaultTargetId);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  // A new context (another day/shift) starts from its own recommendation.
  useEffect(() => {
    setOperation(initialOperation);
    setTargetId(plan.defaultTargetId);
    setReason('');
    setBusy(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, date, plan]);

  const effectiveTargetId = operation === 'REPLACE'
    ? (targetId ?? (plan.validTargetIds.length === 1 ? plan.validTargetIds[0] : null))
    : null;
  const needsTarget = operation === 'REPLACE' && plan.existing.length > 1;
  const availability: Record<ShiftOperation, OperationAvailability> = { REPLACE: plan.replace, ADD: plan.add };
  const nothingAllowed = !plan.add.allowed && !plan.replace.allowed;
  const trimmedReason = reason.trim();
  const canConfirm = !busy && operation !== null && availability[operation].allowed
    && (operation === 'ADD' || (effectiveTargetId !== null && plan.validTargetIds.includes(effectiveTargetId)))
    && trimmedReason.length > 0 && trimmedReason.length <= MAX_REASON;

  const preview = useMemo(
    () => (operation ? previewShiftOperation({ existing: plan.existing, incoming, operation, targetId: effectiveTargetId }) : []),
    [operation, plan.existing, incoming, effectiveTargetId],
  );

  const blockedText = (block: OperationAvailability['blockedBy']) => (block ? t(`shiftContext.blocked.${block}`) : '');

  const confirm = async () => {
    if (!canConfirm || !operation) return;
    setBusy(true);
    try {
      await onConfirm({ operation, targetId: effectiveTargetId, reason: trimmedReason });
    } finally {
      setBusy(false);
    }
  };

  const operations: ShiftOperation[] = ['REPLACE', 'ADD'];

  const existingSection = (
    <section className="shift-context__section" aria-labelledby="shift-context-existing">
      <h3 id="shift-context-existing">{t('shiftContext.existingHeading')}</h3>
      <ul className="shift-context__rows">
        {plan.existing.map((row) => (
          <li key={row.id} data-testid="shift-context-existing-row">
            {row.timeOffRequestId && <Lock size={14} aria-hidden="true" />}
            <strong>{typeLabel(row.shiftType)}</strong>
            <span>{timeRange(row)}</span>
            {row.timeOffRequestId && <span className="shift-context__tag">{t('shiftContext.protectedTag')}</span>}
          </li>
        ))}
      </ul>
      <p className="shift-context__incoming" data-testid="shift-context-incoming">
        <CirclePlus size={14} aria-hidden="true" />
        <span>{t('shiftContext.incoming')}</span> <strong>{typeLabel(incoming.shiftType)}</strong> <span>{timeRange(incoming)}</span>
      </p>
    </section>
  );

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onCancel}
      title={t('shiftContext.title')}
      closeAriaLabel={t('common.close')}
      maxWidth="900px"
      workspace
      height="auto"
      footer={(
        <>
          <button type="button" className="btn-outline" style={{ padding: '9px 14px', fontWeight: 700 }} onClick={onCancel} disabled={busy} data-testid="shift-context-cancel">{t('common.cancel')}</button>
          <button type="button" className="btn-gold" style={{ padding: '9px 14px', fontWeight: 800 }} onClick={() => void confirm()} disabled={!canConfirm} aria-busy={busy} data-testid="shift-context-confirm">
            {busy ? t('shiftContext.confirming') : t('shiftContext.confirm')}
          </button>
        </>
      )}
    >
      <div className="shift-context" data-testid="shift-context-dialog">
        <p className="shift-context__intro">{t('shiftContext.intro', { employee: employeeName, date })}</p>

        {nothingAllowed ? (
          <>
            {existingSection}
            <p className="shift-context__alert" role="alert" data-testid="shift-context-blocked">
              {blockedText(plan.replace.blockedBy ?? plan.add.blockedBy)}
            </p>
          </>
        ) : (
          <div className="shift-context__layout">
            <div className="shift-context__column">
              {existingSection}

              <fieldset className="shift-context__section shift-context__choices">
                <legend>{t('shiftContext.operationLegend')}</legend>
                {operations.map((op) => {
                  const info = availability[op];
                  const Icon = op === 'REPLACE' ? ArrowRightLeft : CirclePlus;
                  return (
                    <label key={op} className={`shift-context__choice${operation === op ? ' is-selected' : ''}${info.allowed ? '' : ' is-disabled'}`}>
                      <input
                        type="radio"
                        name="shift-context-operation"
                        value={op}
                        checked={operation === op}
                        disabled={!info.allowed}
                        onChange={() => setOperation(op)}
                        data-testid={`shift-context-op-${op}`}
                      />
                      <Icon size={16} aria-hidden="true" />
                      <span className="shift-context__choice-body">
                        <strong>
                          {t(op === 'REPLACE' ? 'shiftContext.replace' : 'shiftContext.add')}
                          {plan.recommended === op && <span className="shift-context__recommended" data-testid="shift-context-recommended"> · {t('shiftContext.recommended')}</span>}
                        </strong>
                        <small>{info.allowed ? t(op === 'REPLACE' ? 'shiftContext.replaceHelp' : 'shiftContext.addHelp') : blockedText(info.blockedBy)}</small>
                      </span>
                    </label>
                  );
                })}
              </fieldset>

              {operation === 'REPLACE' && needsTarget && (
                <fieldset className="shift-context__section shift-context__choices">
                  <legend>{t('shiftContext.targetLegend')}</legend>
                  {plan.existing.map((row) => {
                    const valid = plan.validTargetIds.includes(row.id);
                    return (
                      <label key={row.id} className={`shift-context__choice${effectiveTargetId === row.id ? ' is-selected' : ''}${valid ? '' : ' is-disabled'}`}>
                        <input
                          type="radio"
                          name="shift-context-target"
                          value={row.id}
                          checked={effectiveTargetId === row.id}
                          disabled={!valid}
                          onChange={() => setTargetId(row.id)}
                          data-testid="shift-context-target"
                        />
                        <span className="shift-context__choice-body">
                          <strong>{typeLabel(row.shiftType)} <span>{timeRange(row)}</span></strong>
                          {!valid && <small>{t('shiftContext.targetInvalid')}</small>}
                        </span>
                      </label>
                    );
                  })}
                </fieldset>
              )}
            </div>

            <div className="shift-context__column">
              <section className="shift-context__section" aria-labelledby="shift-context-preview">
                <h3 id="shift-context-preview">{t('shiftContext.previewHeading')}</h3>
                <ul className="shift-context__rows" aria-live="polite" data-testid="shift-context-preview">
                  {preview.map((row) => {
                    const Icon = STATUS_ICON[row.status];
                    return (
                      <li key={row.key} className={`shift-context__preview shift-context__preview--${row.status.toLowerCase()}`} data-status={row.status}>
                        <Icon size={14} aria-hidden="true" />
                        <strong>{typeLabel(row.shiftType)}</strong>
                        <span>{timeRange(row)}</span>
                        <span className="shift-context__tag">{t(`shiftContext.status.${row.status}`)}</span>
                      </li>
                    );
                  })}
                </ul>
                {operation === 'REPLACE' && effectiveTargetId && <p className="shift-context__note">{t('shiftContext.historyNote')}</p>}
                {operation === 'REPLACE' && plan.protectedAbsence && <p className="shift-context__note" data-testid="shift-context-protected-note">{t('shiftContext.protectedNote')}</p>}
              </section>

              <div className="shift-context__section">
                <label htmlFor="shift-context-reason" className="shift-context__label">{t('shiftContext.reasonLabel')} <abbr title={t('shiftContext.required')} aria-hidden="true">*</abbr></label>
                <textarea
                  id="shift-context-reason"
                  className="field-textarea"
                  value={reason}
                  maxLength={MAX_REASON}
                  rows={2}
                  placeholder={t('shiftContext.reasonPlaceholder')}
                  onChange={(event) => setReason(event.target.value)}
                  required
                  data-testid="shift-context-reason"
                />
              </div>
            </div>
          </div>
        )}

        {error && <p className="shift-context__alert" role="alert" data-testid="shift-context-error">{error}</p>}
      </div>
    </ModalShell>
  );
}
