// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider } from '../../lib/i18n-react';
import { SessionMembership } from '../../lib/session';
import { OrgSelectorModal } from './OrgSelectorModal';

afterEach(cleanup);

const memberships: SessionMembership[] = [
  { organizationId: 'org-personal', organizationName: 'Toni', organizationType: 'personal', organizationPlan: 'free', role: 'ADMIN' },
  { organizationId: 'org-demo', organizationName: 'Anclora ShiftImport Demo', organizationType: 'company', organizationPlan: 'team', role: 'ADMIN' },
];

describe('OrgSelectorModal — unambiguous organization context', () => {
  it('lists every membership with an unambiguous "type · plan" line, never bare text alone', () => {
    render(
      <I18nProvider>
        <OrgSelectorModal isOpen memberships={memberships} onSelect={() => {}} onLogout={() => {}} />
      </I18nProvider>,
    );

    expect(screen.getByText('Toni')).toBeTruthy();
    expect(screen.getByText('Personal · Free')).toBeTruthy();
    expect(screen.getByText('Anclora ShiftImport Demo')).toBeTruthy();
    expect(screen.getByText('Empresa · Team')).toBeTruthy();
  });

  it('translates the role instead of showing the raw enum', () => {
    render(
      <I18nProvider>
        <OrgSelectorModal isOpen memberships={memberships} onSelect={() => {}} onLogout={() => {}} />
      </I18nProvider>,
    );
    expect(screen.getAllByText('Administrador')).toHaveLength(2);
    expect(screen.queryByText('ADMIN')).toBeNull();
  });

  it('calls onSelect with the clicked organization id', () => {
    const onSelect = vi.fn();
    render(
      <I18nProvider>
        <OrgSelectorModal isOpen memberships={memberships} onSelect={onSelect} onLogout={() => {}} />
      </I18nProvider>,
    );
    fireEvent.click(screen.getByText('Anclora ShiftImport Demo'));
    expect(onSelect).toHaveBeenCalledWith('org-demo');
  });
});
