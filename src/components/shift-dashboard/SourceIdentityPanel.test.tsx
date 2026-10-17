// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { I18nProvider } from '../../lib/i18n-react';

const resolveSourceIdentity = vi.fn();
const listRemoteEmployees = vi.fn();
const createSourceIdentifierMapping = vi.fn();
vi.mock('../../lib/remote', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/remote')>()),
  resolveSourceIdentity: (...a: unknown[]) => resolveSourceIdentity(...a),
  listRemoteEmployees: (...a: unknown[]) => listRemoteEmployees(...a),
  createSourceIdentifierMapping: (...a: unknown[]) => createSourceIdentifierMapping(...a),
}));
import { SourceIdentityPanel } from './SourceIdentityPanel';

afterEach(cleanup);
beforeEach(() => {
  window.localStorage?.setItem?.('anclora_shiftimport_locale_v1', 'es');
  [resolveSourceIdentity, listRemoteEmployees, createSourceIdentifierMapping].forEach((m) => m.mockReset());
});

const SEB = { id: 'seb', name: 'Sebastián Pozo Mendoza — QA', externalEmployeeId: '84881', status: 'active' };
const renderPanel = (props: Partial<React.ComponentProps<typeof SourceIdentityPanel>> = {}) => {
  const onResolved = vi.fn();
  render(<I18nProvider><SourceIdentityPanel sourceSystem="TRYP_EMPLOYEE_CALENDAR" identifier="6888" documentName="Sebastian Pozo Mendoza" canPickManually onResolved={onResolved} {...props} /></I18nProvider>);
  return onResolved;
};

describe('SourceIdentityPanel — canonical ShiftImport identity vs the document alias', () => {
  it('1/7: a known alias resolves automatically, without any prompt', async () => {
    resolveSourceIdentity.mockResolvedValue({ status: 'MAPPED', employee: SEB, candidates: [] });
    const onResolved = renderPanel();
    expect(await screen.findByTestId('source-identity-resolved')).toHaveTextContent('Sebastián Pozo Mendoza — QA');
    expect(screen.queryByTestId('source-identity-select')).toBeNull();
    expect(screen.queryByTestId('source-identity-associate')).toBeNull();
    expect(onResolved).toHaveBeenLastCalledWith({ id: 'seb', name: SEB.name, externalEmployeeId: '84881' });
  });

  it('2: a unique name match is PRESELECTED as a candidate (no empty selector), showing its canonical id, not 6888', async () => {
    resolveSourceIdentity.mockResolvedValue({ status: 'CANDIDATE', employee: SEB, candidates: [] });
    const onResolved = renderPanel();
    expect(await screen.findByTestId('source-identity-candidate')).toHaveTextContent('Sebastián Pozo Mendoza — QA');
    expect(screen.getByTestId('source-identity-candidate-id')).toHaveTextContent('ID 84881');
    expect(screen.queryByTestId('source-identity-select')).toBeNull();
    expect(screen.getByTestId('source-identity-reference')).toHaveTextContent('6888'); // small secondary reference only
    expect(screen.getByTestId('source-identity-candidate-id')).not.toHaveTextContent('6888');
    expect(onResolved).not.toHaveBeenCalledWith(expect.objectContaining({ id: 'seb' })); // not resolved until explicitly associated
  });

  it('6/13: "Asociar y continuar" persists first, reads the mapping back, and only then opens the gate', async () => {
    resolveSourceIdentity.mockResolvedValueOnce({ status: 'CANDIDATE', employee: SEB, candidates: [] });
    createSourceIdentifierMapping.mockResolvedValue({ created: true });
    resolveSourceIdentity.mockResolvedValueOnce({ status: 'MAPPED', employee: SEB, candidates: [] });
    const onResolved = renderPanel();
    fireEvent.click(await screen.findByTestId('source-identity-associate'));
    await waitFor(() => expect(createSourceIdentifierMapping).toHaveBeenCalledWith({ employeeId: 'seb', sourceSystem: 'TRYP_EMPLOYEE_CALENDAR', externalIdentifier: '6888', documentName: 'Sebastian Pozo Mendoza' }));
    await waitFor(() => expect(onResolved).toHaveBeenLastCalledWith({ id: 'seb', name: SEB.name, externalEmployeeId: '84881' }));
    expect(resolveSourceIdentity).toHaveBeenCalledTimes(2); // lookup + read-back
  });

  it('the gate stays closed (and an error is shown) when the association could not be persisted', async () => {
    resolveSourceIdentity.mockResolvedValue({ status: 'CANDIDATE', employee: SEB, candidates: [] });
    createSourceIdentifierMapping.mockRejectedValue(new Error('boom'));
    const onResolved = renderPanel();
    fireEvent.click(await screen.findByTestId('source-identity-associate'));
    expect(await screen.findByTestId('source-identity-error')).toBeInTheDocument();
    expect(onResolved).not.toHaveBeenCalledWith(expect.objectContaining({ id: 'seb' }));
  });

  it('3: no candidate -> the manual selector (only then), listing employees with their canonical id', async () => {
    resolveSourceIdentity.mockResolvedValue({ status: 'NONE', employee: null, candidates: [] });
    listRemoteEmployees.mockResolvedValue([{ id: 'e1', name: 'Empleado QA', externalEmployeeId: '111', status: 'active' }]);
    renderPanel();
    expect(await screen.findByTestId('source-identity-select')).toHaveValue('');
    expect(screen.getByRole('option', { name: 'Empleado QA — ID 111' })).toBeInTheDocument();
  });

  it('4: ambiguous names -> manual choice among the matches, disambiguated by canonical id, nothing preselected', async () => {
    resolveSourceIdentity.mockResolvedValue({ status: 'AMBIGUOUS', employee: null, candidates: [{ ...SEB, name: 'Juan Pérez', externalEmployeeId: '12345' }, { ...SEB, id: 'j2', name: 'Juan Pérez', externalEmployeeId: '98765' }] });
    renderPanel();
    expect(await screen.findByTestId('source-identity-select')).toHaveValue('');
    expect(screen.getByRole('option', { name: 'Juan Pérez — ID 12345' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Juan Pérez — ID 98765' })).toBeInTheDocument();
  });

  it('5: an alias that belongs to somebody else than the name says is blocked (fail closed)', async () => {
    resolveSourceIdentity.mockResolvedValue({ status: 'MISMATCH', employee: SEB, candidates: [] });
    renderPanel();
    expect(await screen.findByTestId('source-identity-blocked')).toHaveTextContent('asociado a otro empleado');
  });

  it('an EMPLOYEE gets no manual selector: an unidentifiable calendar is blocked', async () => {
    resolveSourceIdentity.mockResolvedValue({ status: 'NOT_YOURS', employee: null, candidates: [] });
    renderPanel({ canPickManually: false, lockedEmployeeId: 'me' });
    expect(await screen.findByTestId('source-identity-blocked')).toHaveTextContent('no corresponde a tu empleado');
    expect(screen.queryByTestId('source-identity-select')).toBeNull();
  });
});
