// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { I18nProvider } from '../../lib/i18n-react';

const resolveSourceIdentifier = vi.fn();
const matchRemoteEmployee = vi.fn();
const listRemoteEmployees = vi.fn();
const createSourceIdentifierMapping = vi.fn();
vi.mock('../../lib/remote', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/remote')>()),
  resolveSourceIdentifier: (...a: unknown[]) => resolveSourceIdentifier(...a),
  matchRemoteEmployee: (...a: unknown[]) => matchRemoteEmployee(...a),
  listRemoteEmployees: (...a: unknown[]) => listRemoteEmployees(...a),
  createSourceIdentifierMapping: (...a: unknown[]) => createSourceIdentifierMapping(...a),
}));
import { SourceIdentityPanel } from './SourceIdentityPanel';

afterEach(cleanup);
beforeEach(() => {
  window.localStorage?.setItem?.('anclora_shiftimport_locale_v1', 'es');
  [resolveSourceIdentifier, matchRemoteEmployee, listRemoteEmployees, createSourceIdentifierMapping].forEach((m) => m.mockReset());
  resolveSourceIdentifier.mockResolvedValue({ mapped: false, employee: null });
  matchRemoteEmployee.mockResolvedValue({ kind: 'new', employees: [] });
});

const renderPanel = (props: Partial<React.ComponentProps<typeof SourceIdentityPanel>> = {}) => {
  const onResolved = vi.fn();
  render(<I18nProvider><SourceIdentityPanel sourceSystem="TRYP_EMPLOYEE_CALENDAR" identifier="6888" canAssociate={false} onResolved={onResolved} {...props} /></I18nProvider>);
  return onResolved;
};

describe('SourceIdentityPanel — a source number is never silently another number', () => {
  it('blocks an unmapped number for a non-admin (nothing resolved, no name-based linking)', async () => {
    const onResolved = renderPanel();
    expect(await screen.findByTestId('source-identity-blocked')).toHaveTextContent('Un administrador debe asociarla');
    expect(onResolved).not.toHaveBeenLastCalledWith(expect.objectContaining({ id: expect.anything() }));
  });

  it('lets an admin associate it explicitly, then resolves the employee', async () => {
    listRemoteEmployees.mockResolvedValue([{ id: 'e1', name: 'Empleado QA', externalEmployeeId: '84881', status: 'active' }]);
    createSourceIdentifierMapping.mockResolvedValue({ created: true });
    const onResolved = renderPanel({ canAssociate: true });
    const select = await screen.findByTestId('source-identity-select');
    fireEvent.change(select, { target: { value: 'e1' } });
    resolveSourceIdentifier.mockResolvedValue({ mapped: true, employee: { id: 'e1', name: 'Empleado QA', externalEmployeeId: '84881', status: 'active' } });
    fireEvent.click(screen.getByTestId('source-identity-associate'));
    await waitFor(() => expect(createSourceIdentifierMapping).toHaveBeenCalledWith({ employeeId: 'e1', sourceSystem: 'TRYP_EMPLOYEE_CALENDAR', externalIdentifier: '6888' }));
    await waitFor(() => expect(onResolved).toHaveBeenLastCalledWith({ id: 'e1', name: 'Empleado QA', externalEmployeeId: '84881' }));
  });

  it('an EMPLOYEE cannot import a number mapped to somebody else', async () => {
    resolveSourceIdentifier.mockResolvedValue({ mapped: true, employee: { id: 'other', name: 'Otro', externalEmployeeId: '1', status: 'active' } });
    renderPanel({ lockedEmployeeId: 'me' });
    expect(await screen.findByTestId('source-identity-blocked')).toHaveTextContent('asociada a otro empleado');
  });
});
