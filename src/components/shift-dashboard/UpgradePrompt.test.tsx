// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
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
  });

  it('renders close and pricing buttons by default', () => {
    const onClose = vi.fn();
    render(
      <I18nProvider>
        <UpgradePrompt isOpen onClose={onClose} />
      </I18nProvider>,
    );
    // Should have multiple buttons (close + pricing CTA)
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThanOrEqual(2);
  });
});
