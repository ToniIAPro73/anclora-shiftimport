import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChangeRequest, loadRemoteShifts } from '../../lib/remote';
import { ModalShell } from '../ui/ModalShell';
import { useI18n } from '../../lib/use-i18n';
import { ChangeRequestForm } from './ChangeRequestForm';
import { Shift } from '../../lib/types';
import { ShiftPicker } from './ShiftPicker';

interface NewChangeRequestModalProps {
  isOpen: boolean;
  employeeId: string;
  onClose: () => void;
  onCreated?: (request: ChangeRequest) => void;
}

type ShiftState = { status: 'loading' | 'ready' | 'error'; shifts: Shift[] };

export function NewChangeRequestModal({ isOpen, employeeId, onClose, onCreated }: NewChangeRequestModalProps) {
  const { t } = useI18n();
  const [state, setState] = useState<ShiftState>({ status: 'loading', shifts: [] });
  const [selectedShiftId, setSelectedShiftId] = useState('');

  const load = useCallback(async () => {
    setState({ status: 'loading', shifts: [] });
    try {
      const shifts = await loadRemoteShifts(employeeId);
      setState({ status: 'ready', shifts });
      setSelectedShiftId((current) => current && shifts.some((shift) => shift.id === current)
        ? current
        : shifts[0]?.id ?? '');
    } catch {
      setState({ status: 'error', shifts: [] });
      setSelectedShiftId('');
    }
  }, [employeeId]);

  useEffect(() => {
    if (isOpen) void load();
  }, [isOpen, load]);

  const selectedShift = useMemo(
    () => state.shifts.find((shift) => shift.id === selectedShiftId) ?? null,
    [selectedShiftId, state.shifts],
  );

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title={t('employeePortal.newRequest')}
      closeAriaLabel={t('common.close')}
      maxWidth="620px"
      workspace
    >
      <div className="employee-new-request" data-testid="new-change-request-modal" style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
        <p className="employee-new-request__description" style={{ margin: '0 0 14px', fontSize: '0.84rem', color: 'var(--text-muted)' }}>
          {t('employeePortal.newRequestDescription')}
        </p>

        {state.status === 'loading' && (
          <p role="status" aria-busy="true">{t('employeePortal.loadingOwnShifts')}</p>
        )}
        {state.status === 'error' && (
          <div role="alert">
            <p>{t('employeePortal.ownShiftsError')}</p>
            <button type="button" onClick={() => void load()}>{t('employeeRequestStatus.retry')}</button>
          </div>
        )}
        {state.status === 'ready' && state.shifts.length === 0 && (
          <p className="employee-new-request__empty">{t('employeePortal.noOwnShiftsForRequest')}</p>
        )}
        {state.status === 'ready' && state.shifts.length > 0 && selectedShift && (
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label htmlFor="employee-new-request-shift" style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '6px', color: 'var(--text-primary)' }}>
                {t('employeePortal.requestShiftLabel')}
              </label>
              <ShiftPicker
                id="employee-new-request-shift"
                shifts={state.shifts}
                selectedShiftId={selectedShiftId}
                onSelectShift={setSelectedShiftId}
              />
            </div>
            <ChangeRequestForm
              key={selectedShift.id}
              shiftId={selectedShift.id}
              shiftStartTime={selectedShift.startTime}
              shiftEndTime={selectedShift.endTime}
              onCreated={onCreated}
            />
          </div>
        )}
      </div>
    </ModalShell>
  );
}
