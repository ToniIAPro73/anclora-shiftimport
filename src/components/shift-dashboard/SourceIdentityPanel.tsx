import { useEffect, useRef, useState } from 'react';
import {
  createSourceIdentifierMapping, listRemoteEmployees, resolveSourceIdentity, type RemoteEmployee, type SourceIdentityEmployee,
} from '../../lib/remote';
import { useI18n } from '../../lib/use-i18n';

interface SourceIdentityPanelProps {
  sourceSystem: string;
  /** Payroll code printed in the document (an alias of the source system, NOT the canonical employee id). */
  identifier: string;
  /** Name printed in the document: used to propose a candidate, never to link silently. */
  documentName?: string | null;
  /** ADMIN / OWNER may pick any employee manually. */
  canPickManually: boolean;
  /** EMPLOYEE: the only acceptable target is this employee. */
  lockedEmployeeId?: string | null;
  onResolved: (employee: ResolvedSourceEmployee | null) => void;
}

export interface ResolvedSourceEmployee { id: string; name: string; externalEmployeeId: string | null }

type State =
  | { status: 'checking' }
  | { status: 'resolved'; employee: SourceIdentityEmployee }
  | { status: 'candidate'; employee: SourceIdentityEmployee }
  | { status: 'ambiguous'; candidates: SourceIdentityEmployee[] }
  | { status: 'manual' }
  | { status: 'blocked'; reason: 'mismatch' | 'not-yours' | 'needs-admin' }
  | { status: 'error' };

const toResolved = (employee: SourceIdentityEmployee): ResolvedSourceEmployee => ({ id: employee.id, name: employee.name, externalEmployeeId: employee.externalEmployeeId });

/**
 * Identity of an individual TRYP export. Two identities never mix: the CANONICAL ShiftImport employee (name + id) and the
 * document's alias (payroll code of the source system). Resolution is server side: known alias -> canonical id -> unique exact
 * name (proposed, then confirmed explicitly). The gate only opens once the association is PERSISTED and read back.
 */
export function SourceIdentityPanel({ sourceSystem, identifier, documentName, canPickManually, lockedEmployeeId = null, onResolved }: SourceIdentityPanelProps) {
  const { t } = useI18n();
  const [state, setState] = useState<State>({ status: 'checking' });
  const [options, setOptions] = useState<Array<{ id: string; name: string; externalEmployeeId: string | null }>>([]);
  const [chosen, setChosen] = useState('');
  const [working, setWorking] = useState(false);
  const reportRef = useRef(onResolved);
  reportRef.current = onResolved;

  const resolve = async (): Promise<State> => {
    reportRef.current(null);
    try {
      const verdict = await resolveSourceIdentity({ sourceSystem, externalIdentifier: identifier, documentName: documentName ?? '' });
      let next: State;
      if ((verdict.status === 'MAPPED' || verdict.status === 'CANONICAL') && verdict.employee) {
        next = lockedEmployeeId && verdict.employee.id !== lockedEmployeeId ? { status: 'blocked', reason: 'not-yours' } : { status: 'resolved', employee: verdict.employee };
      } else if (verdict.status === 'CANDIDATE' && verdict.employee) {
        next = { status: 'candidate', employee: verdict.employee };
      } else if (verdict.status === 'AMBIGUOUS') {
        next = { status: 'ambiguous', candidates: verdict.candidates };
        setOptions(verdict.candidates);
      } else if (verdict.status === 'MISMATCH') {
        next = { status: 'blocked', reason: 'mismatch' };
      } else if (verdict.status === 'NOT_YOURS' || lockedEmployeeId || !canPickManually) {
        next = { status: 'blocked', reason: lockedEmployeeId ? 'not-yours' : 'needs-admin' };
      } else {
        const all = (await listRemoteEmployees()).filter((employee: RemoteEmployee) => employee.status !== 'inactive');
        setOptions(all.map((employee) => ({ id: employee.id, name: employee.name, externalEmployeeId: employee.externalEmployeeId })));
        next = { status: 'manual' };
      }
      setState(next);
      if (next.status === 'resolved') reportRef.current(toResolved(next.employee));
      return next;
    } catch {
      const failed: State = { status: 'error' };
      setState(failed);
      return failed;
    }
  };

  useEffect(() => { setState({ status: 'checking' }); void resolve(); }, [sourceSystem, identifier, documentName]); // eslint-disable-line react-hooks/exhaustive-deps

  const associate = async (employeeId: string) => {
    if (!employeeId) return;
    setWorking(true);
    try {
      await createSourceIdentifierMapping({ employeeId, sourceSystem, externalIdentifier: identifier, documentName: documentName ?? undefined });
      // Persisted: read it back from the server. The gate never opens on local React state alone.
      const confirmed = await resolve();
      if (confirmed.status !== 'resolved') setState({ status: 'error' });
    } catch {
      setState({ status: 'error' });
    } finally {
      setWorking(false);
    }
  };

  const box = { marginTop: '12px', padding: '12px', border: '1px solid var(--glass-border)', borderRadius: '10px', display: 'grid', gap: '8px', fontSize: '0.86rem' } as const;
  const optionLabel = (employee: { name: string; externalEmployeeId: string | null }) => (employee.externalEmployeeId ? `${employee.name} — ID ${employee.externalEmployeeId}` : employee.name);

  return (
    <div style={box} data-testid="source-identity-panel" data-status={state.status} role="status">
      <strong>{t('importModal.identity.title')}</strong>
      {state.status === 'checking' && <span>{t('importModal.identity.checking')}</span>}
      {state.status === 'resolved' && (
        <span data-testid="source-identity-resolved">{t('importModal.identity.resolved', { name: state.employee.name })}</span>
      )}
      {state.status === 'candidate' && (
        <>
          <span>{t('importModal.identity.candidateIntro')}</span>
          <strong data-testid="source-identity-candidate">{state.employee.name}</strong>
          {state.employee.externalEmployeeId && <span data-testid="source-identity-candidate-id">{t('importModal.identity.employeeId', { id: state.employee.externalEmployeeId })}</span>}
          <button type="button" className="eff-button eff-button--primary" disabled={working} onClick={() => void associate(state.employee.id)} data-testid="source-identity-associate">
            {t('importModal.identity.associateContinue')}
          </button>
        </>
      )}
      {(state.status === 'ambiguous' || state.status === 'manual') && (
        <>
          <span>{t(state.status === 'ambiguous' ? 'importModal.identity.ambiguous' : 'importModal.identity.notFound')}</span>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <select value={chosen} onChange={(event) => setChosen(event.target.value)} aria-label={t('importModal.identity.chooseEmployee')} data-testid="source-identity-select">
              <option value="">{t('importModal.identity.chooseEmployee')}</option>
              {options.map((employee) => <option key={employee.id} value={employee.id}>{optionLabel(employee)}</option>)}
            </select>
            <button type="button" className="eff-button eff-button--primary" disabled={!chosen || working} onClick={() => void associate(chosen)} data-testid="source-identity-associate">
              {t('importModal.identity.associateContinue')}
            </button>
          </div>
        </>
      )}
      {state.status === 'blocked' && <span role="alert" data-testid="source-identity-blocked">{t(`importModal.identity.blocked.${state.reason}`)}</span>}
      {state.status === 'error' && <span role="alert" data-testid="source-identity-error">{t('importModal.identity.error')}</span>}
      <small style={{ color: 'var(--text-subtle)' }} data-testid="source-identity-reference">{t('importModal.identity.reference', { identifier })}</small>
    </div>
  );
}
