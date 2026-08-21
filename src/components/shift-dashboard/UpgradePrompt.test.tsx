// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider } from '../../lib/i18n-react';
import { UpgradePrompt } from './UpgradePrompt';

afterEach(cleanup);

describe('UpgradePrompt', () => {
  it('shows the generic copy with no context props', () => {
    render(
      <I18nProvider>
        <UpgradePrompt isOpen onClose={() => {}} />
      </I18nProvider>,
    );
    expect(screen.getByText('Esta función está disponible en Team')).toBeTruthy();
    expect(screen.queryByText(/Esta organización usa el plan/)).toBeNull();
    expect(screen.queryByText(/^Cambiar a/)).toBeNull();
  });

  it('shows the contextual current-plan line when currentPlan is given', () => {
    render(
      <I18nProvider>
        <UpgradePrompt isOpen onClose={() => {}} currentPlan="free" />
      </I18nProvider>,
    );
    expect(screen.getByText('Esta organización usa el plan Free. Las funciones multi-empleado están disponibles en Team.')).toBeTruthy();
  });

  it('offers "Switch to X" only when a Team-plan sibling org is given, and calls onSwitchOrg', () => {
    const onSwitchOrg = vi.fn();
    const onClose = vi.fn();
    render(
      <I18nProvider>
        <UpgradePrompt
          isOpen
          onClose={onClose}
          currentPlan="free"
          switchTarget={{ id: 'org-demo', name: 'Anclora ShiftImport Demo' }}
          onSwitchOrg={onSwitchOrg}
        />
      </I18nProvider>,
    );
    const switchButton = screen.getByText('Cambiar a Anclora ShiftImport Demo');
    fireEvent.click(switchButton);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSwitchOrg).toHaveBeenCalledWith('org-demo');
  });

  it('never shows "Switch to X" without a switchTarget', () => {
    render(
      <I18nProvider>
        <UpgradePrompt isOpen onClose={() => {}} currentPlan="free" />
      </I18nProvider>,
    );
    expect(screen.queryByText(/^Cambiar a/)).toBeNull();
  });
});
