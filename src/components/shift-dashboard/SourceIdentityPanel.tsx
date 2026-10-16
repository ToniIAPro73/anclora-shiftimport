import { useEffect, useRef, useState } from 'react';
import {
  createSourceIdentifierMapping, listRemoteEmployees, matchRemoteEmployee, resolveSourceIdentifier, type RemoteEmployee,
} from '../../lib/remote';
import { useI18n } from '../../lib/use-i18n';

interface SourceIdentityPanelProps {
  sourceSystem: string;
  identifier: string;
  /** Source-side name (shown for context only; never used to link). */
  documentName?: string | null;
  /** ADMIN / OWNER may associate a source number with an employee. */
  canAssociate: boolean;
  /** EMPLOYEE self-import: the only acceptable target is this employee. */
  lockedEmployeeId?: string | null;
  /** Employee the user was already working with (pre-selected in the association list). */
  presetEmployeeId?: string | null;
  onResolved: (employee: ResolvedSourceEmployee | null) => void;
}

export interface ResolvedSourceEmployee { id: string; name: string; externalEmployeeId: string | null }

type State =
  | { status: 'checking' }
  | { status: 'resolved'; employee: { id: string; name: string }; via: 'MAPPING' | 'CANONICAL' }
  | { status: 'needs-association' }
  | { status: 'blocked'; reason: 'mapped-to-other' | 'not-yours' | 'needs-admin' }
  | { status: 'error' };

/**
 * A source system's payroll number (e.g. TRYP 6888) is NOT assumed to equal the canonical number of anyone
 * (84881 in another system). The target employee is resolved only by (1) an explicit mapping, (2) the canonical id,
 * or (3) an explicit administrative association. Never by name, never silently.
 */
export function SourceIdentityPanel({ sourceSystem, identifier, documentName, canAssociate, lockedEmployeeId = null, presetEmployeeId = null, onResolved }: SourceIdentityPanelProps) {
  const { t } = useI18n();
  const [state, setState] = useState<State>({ status: 'checking' });
  const [candidates, setCandidates] = useState<RemoteEmployee[]>([]);
  const [chosen, setChosen] = useState(presetEmployeeId ?? '');
  const [working, setWorking] = useState(false);
  const reportRef = useRef(onResolved);
  reportRef.current = onResolved;

  const resolve = async () => {
    setState({ status: 'checking' });
    reportRef.current(null);
    try {
      const mapped = await resolveSourceIdentifier(sourceSystem, identifier);
      if (mapped.mapped && mapped.employee) {
        if (lockedEmployeeId && mapped.employee.id !== lockedEmployeeId) { setState({ status: 'blocked', reason: 'mapped-to-other' }); return; }
        setState({ status: 'resolved', employee: { id: mapped.employee.id, name: mapped.employee.name }, via: 'MAPPING' });
        reportRef.current({ id: mapped.employee.id, name: mapped.employee.name, externalEmployeeId: mapped.employee.externalEmployeeId });
        return;
      }
      const canonical = await matchRemoteEmployee({ name: '', externalId: identifier });
      if (canonical.kind.startsWith('recognized') && canonical.employees.length === 1) {
        const employee = canonical.employees[0];
        if (lockedEmployeeId && employee.id !== lockedEmployeeId) { setState({ status: 'blocked', reason: 'not-yours' }); return; }
        setState({ status: 'resolved', employee: { id: employee.id, name: employee.name }, via: 'CANONICAL' });
        reportRef.current({ id: employee.id, name: employee.name, externalEmployeeId: employee.externalEmployeeId ?? null });
        return;
      }
      if (lockedEmployeeId || !canAssociate) { setState({ status: 'blocked', reason: lockedEmployeeId ? 'not-yours' : 'needs-admin' }); return; }
      setCandidates((await listRemoteEmployees()).filter((employee) => employee.status !== 'inactive'));
      setState({ status: 'needs-association' });
    } catch {
      setState({ status: 'error' });
    }
  };

  useEffect(() => { void resolve(); }, [sourceSystem, identifier]); // eslint-disable-line react-hooks/exhaustive-deps

  const associate = async () => {
    if (!chosen) return;
    setWorking(true);
    try {
      await createSourceIdentifierMapping({ employeeId: chosen, sourceSystem, externalIdentifier: identifier });
      await resolve();
    } catch {
      setState({ status: 'error' });
    } finally {
      setWorking(false);
    }
  };

  const box = { marginTop: '12px', padding: '12px', border: '1px solid var(--glass-border)', borderRadius: '10px', display: 'grid', gap: '8px', fontSize: '0.86rem' } as const;
  return (
    <div style={box} data-testid="source-identity-panel" data-status={state.status} role="status">
      <strong>{t('importModal.identity.title', { identifier })}</strong>
      {documentName && <span style={{ color: 'var(--text-subtle)' }}>{t('importModal.identity.documentName', { name: documentName })}</span>}
      {state.status === 'checking' && <span>{t('importModal.identity.checking')}</span>}
      {state.status === 'resolved' && (
        <span data-testid="source-identity-resolved">{t(state.via === 'MAPPING' ? 'importModal.identity.resolvedMapping' : 'importModal.identity.resolvedCanonical', { name: state.employee.name })}</span>
      )}
      {state.status === 'needs-association' && (
        <>
          <span>{t('importModal.identity.needsAssociation')}</span>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <select value={chosen} onChange={(event) => setChosen(event.target.value)} aria-label={t('importModal.identity.chooseEmployee')} data-testid="source-identity-select">
              <option value="">{t('importModal.identity.chooseEmployee')}</option>
              {candidates.map((employee) => (
                <option key={employee.id} value={employee.id}>{employee.name}{employee.externalEmployeeId ? ` · ${employee.externalEmployeeId}` : ''}</option>
              ))}
            </select>
            <button type="button" className="eff-button eff-button--primary" disabled={!chosen || working} onClick={() => void associate()} data-testid="source-identity-associate">
              {t('importModal.identity.associate', { identifier })}
            </button>
          </div>
        </>
      )}
      {state.status === 'blocked' && <span role="alert" data-testid="source-identity-blocked">{t(`importModal.identity.blocked.${state.reason}`)}</span>}
      {state.status === 'error' && <span role="alert">{t('importModal.identity.error')}</span>}
    </div>
  );
}
