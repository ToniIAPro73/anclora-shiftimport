// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider } from '../../lib/i18n-react';
import { ConfirmDialog } from './ConfirmDialog';

afterEach(cleanup);

describe('ConfirmDialog', () => {
  it('uses alertdialog semantics and focuses the safe action', () => {
    render(<I18nProvider><ConfirmDialog isOpen title="Eliminar" description="Borra 2 turnos" confirmLabel="Eliminar turnos" cancelLabel="Cancelar" onConfirm={() => {}} onCancel={() => {}} /></I18nProvider>);
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancelar' }));
  });

  it('does not run a second confirmation while the first is pending', async () => {
    let resolve!: () => void;
    const onConfirm = vi.fn(() => new Promise<void>((done) => { resolve = done; }));
    render(<I18nProvider><ConfirmDialog isOpen title="Eliminar" description="Borra" confirmLabel="Eliminar" cancelLabel="Cancelar" onConfirm={onConfirm} onCancel={() => {}} /></I18nProvider>);
    const button = screen.getByRole('button', { name: 'Eliminar' });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(onConfirm).toHaveBeenCalledOnce();
    resolve();
  });
});
