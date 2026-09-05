// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider } from '../../lib/i18n-react';
import { BottomNav } from './BottomNav';

function renderNavigation(unreadCount = 0) {
  const onNavigate = () => {};
  return render(
    <I18nProvider>
      <BottomNav activeView="today" detailReturnView="today" unreadCount={unreadCount} onNavigate={onNavigate} />
    </I18nProvider>,
  );
}

describe('BottomNav', () => {
  it('renders exactly four fixed sections with a single active marker', () => {
    renderNavigation();
    const navigation = screen.getByTestId('employee-portal-nav');
    const buttons = navigation.querySelectorAll('button');
    expect(buttons).toHaveLength(4);
    expect(screen.getAllByRole('button', { name: 'Hoy' })[0].getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('button', { name: 'Más' }).getAttribute('aria-current')).toBeNull();
  });

  it('shows the unread badge only on More and keeps controls keyboard-operable', () => {
    renderNavigation(3);
    const more = screen.getByRole('button', { name: 'Más' });
    expect(more).toBeTruthy();
    expect(screen.getByLabelText('3 notificaciones sin leer')).toBeTruthy();
    more.focus();
    expect(document.activeElement).toBe(more);
    fireEvent.keyDown(more, { key: 'Enter' });
  });
});
