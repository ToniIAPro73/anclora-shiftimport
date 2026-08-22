// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider } from '../../lib/i18n-react';
import { SessionMembership } from '../../lib/session';
import { OrgSelectorModal } from './OrgSelectorModal';

afterEach(cleanup);

const memberships: SessionMembership[] = [
  { organizationId: 'org-1', organizationName: 'Toni Test A', role: 'ADMIN' },
  { organizationId: 'org-2', organizationName: 'Anclora Demo B', role: 'ADMIN' },
];

describe('OrgSelectorModal — unambiguous organization context', () => {
  it('lists every membership with the name and role label', () => {
    render(
      <I18nProvider>
        <OrgSelectorModal isOpen memberships={memberships} onSelect={() => {}} onLogout={() => {}} />
      </I18nProvider>,
    );

    const buttons = screen.getAllByRole('button');
    // 2 org buttons + logout = 3
    expect(buttons).toHaveLength(3);
    // Each org button contains its name and role
    buttons.forEach((btn) => {
      if (btn.textContent?.includes('Toni') || btn.textContent?.includes('Anclora')) {
        expect(btn.textContent).toContain('Administrador');
      }
    });
  });

  it('calls onSelect with the clicked organization id', () => {
    const onSelect = vi.fn();
    render(
      <I18nProvider>
        <OrgSelectorModal isOpen memberships={memberships} onSelect={onSelect} onLogout={() => {}} />
      </I18nProvider>,
    );
    const buttons = screen.getAllByRole('button');
    const demoButton = buttons.find((b) => b.textContent?.includes('Demo'));
    expect(demoButton).toBeDefined();
    if (demoButton) {
      fireEvent.click(demoButton!);
      expect(onSelect).toHaveBeenCalledWith('org-2');
    }
  });
});
