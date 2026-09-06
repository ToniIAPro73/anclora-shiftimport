import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChangeRequest, loadRemoteShifts } from '../../lib/remote';
import { ModalShell } from '../ui/ModalShell';
import { useI18n } from '../../lib/use-i18n';
import { ChangeRequestForm } from './ChangeRequestForm';
import { Shift } from '../../lib/types';

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
    >
      <div className="employee-new-request" data-testid="new-change-request-modal">
        <p className="employee-new-request__description">{t('employeePortal.newRequestDescription')}</p>

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
          <>
            <label htmlFor="employee-new-request-shift">{t('employeePortal.requestShiftLabel')}</label>
            <select
              id="employee-new-request-shift"
              value={selectedShiftId}
              onChange={(event) => setSelectedShiftId(event.target.value)}
            >
              {state.shifts.map((shift) => (
                <option key={shift.id} value={shift.id}>
                  {shift.date} · {shift.startTime} — {shift.endTime}
                </option>
              ))}
            </select>
            <ChangeRequestForm
              key={selectedShift.id}
              shiftId={selectedShift.id}
              shiftStartTime={selectedShift.startTime}
              shiftEndTime={selectedShift.endTime}
              onCreated={onCreated}
            />
          </>
        )}
      </div>
    </ModalShell>
  );
}
