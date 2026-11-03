// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ModalShell } from './ModalShell';

afterEach(cleanup);

function renderShell() {
  return render(
    <ModalShell isOpen onClose={vi.fn()} title="Host" closeAriaLabel="Cerrar">
      <div data-testid="result" tabIndex={-1} role="status">Resultado</div>
      <button type="button">Primero</button>
      <button type="button">Último</button>
    </ModalShell>,
  );
}

describe('ModalShell focus trap', () => {
  it('Tab from a focusable-by-code region inside the dialog re-enters the tab order instead of leaving it', () => {
    renderShell();
    const result = screen.getByTestId('result');
    result.focus();
    expect(document.activeElement).toBe(result);
    fireEvent.keyDown(result, { key: 'Tab' });
    const first = document.activeElement as HTMLElement;
    expect(first.closest('[role="dialog"]')).not.toBeNull();
    expect(first).not.toBe(document.body);
  });

  it('Shift+Tab from that region goes to the last tabbable element', () => {
    renderShell();
    screen.getByTestId('result').focus();
    fireEvent.keyDown(screen.getByTestId('result'), { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Último' }));
  });

  it('Tab on the last element still wraps to the first', () => {
    renderShell();
    const last = screen.getByRole('button', { name: 'Último' });
    last.focus();
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cerrar' }));
  });
});
