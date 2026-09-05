// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createRemoteShiftComment, loadRemoteShiftComments } from '../../lib/remote';
import { I18nProvider } from '../../lib/i18n-react';
import { ThemeProvider } from '../../lib/theme-react';
import { setupLocalStorageMock } from '../../test-utils/local-storage';
import { ShiftComments } from './ShiftComments';

vi.mock('../../lib/remote', () => ({
  createRemoteShiftComment: vi.fn(),
  loadRemoteShiftComments: vi.fn(),
}));

setupLocalStorageMock();
afterEach(cleanup);

const mockedLoadComments = vi.mocked(loadRemoteShiftComments);
const mockedCreateComment = vi.mocked(createRemoteShiftComment);
const shiftId = '11111111-1111-4111-8111-111111111111';

function renderComments() {
  return render(
    <ThemeProvider>
      <I18nProvider>
        <ShiftComments shiftId={shiftId} />
      </I18nProvider>
    </ThemeProvider>,
  );
}

describe('ShiftComments', () => {
  beforeEach(() => {
    mockedLoadComments.mockReset();
    mockedCreateComment.mockReset();
  });

  it('renders existing comments chronologically and exposes a labelled composer', async () => {
    mockedLoadComments.mockResolvedValue([
      { id: 'comment-1', shiftId, employeeId: 'employee-1', body: 'Llego diez minutos antes.', createdAt: '2026-09-05T08:00:00.000Z' },
      { id: 'comment-2', shiftId, employeeId: 'employee-1', body: 'Necesito revisar la entrada.', createdAt: '2026-09-05T09:00:00.000Z' },
    ]);
    renderComments();
    await waitFor(() => expect(screen.getByText('Llego diez minutos antes.')).toBeTruthy());
    expect(screen.getByText('Necesito revisar la entrada.')).toBeTruthy();
    expect(screen.getByLabelText('Tu comentario')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Añadir comentario' })).toBeTruthy();
    expect(screen.getByText('2', { selector: '.employee-shift-comments__count' })).toBeTruthy();
  });

  it('adds a comment without reload, announces it and renders user text safely', async () => {
    mockedLoadComments.mockResolvedValue([]);
    mockedCreateComment.mockResolvedValue({
      id: 'comment-new', shiftId, employeeId: 'employee-1', body: '<b>Solo texto</b>', createdAt: '2026-09-05T10:00:00.000Z',
    });
    const { container } = renderComments();
    await waitFor(() => expect(screen.getByText('Todavía no hay comentarios.')).toBeTruthy());
    const textarea = screen.getByLabelText('Tu comentario');
    fireEvent.change(textarea, { target: { value: '<b>Solo texto</b>' } });
    fireEvent.click(screen.getByRole('button', { name: 'Añadir comentario' }));
    await waitFor(() => expect(screen.getByText('<b>Solo texto</b>')).toBeTruthy());
    expect(mockedCreateComment).toHaveBeenCalledWith(shiftId, '<b>Solo texto</b>');
    expect(textarea).toHaveProperty('value', '');
    expect(screen.getByText('Comentario añadido.')).toBeTruthy();
    expect(container.querySelector('b')).toBeNull();
  });

  it('keeps the draft when sending fails and validates whitespace locally', async () => {
    mockedLoadComments.mockResolvedValue([]);
    mockedCreateComment.mockRejectedValue(new Error('offline'));
    renderComments();
    await waitFor(() => expect(screen.getByText('Todavía no hay comentarios.')).toBeTruthy());
    const textarea = screen.getByLabelText('Tu comentario');
    fireEvent.change(textarea, { target: { value: '  Nota importante  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Añadir comentario' }));
    await waitFor(() => expect(screen.getByText('No se pudo enviar el comentario. El texto se ha conservado.')).toBeTruthy());
    expect(textarea).toHaveProperty('value', '  Nota importante  ');
    fireEvent.change(textarea, { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Añadir comentario' }));
    expect(screen.getByText('Escribe un comentario antes de enviarlo.')).toBeTruthy();
    expect(mockedCreateComment).toHaveBeenCalledTimes(1);
  });

  it('shows a load error and retries the same shift comments endpoint', async () => {
    mockedLoadComments.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([]);
    renderComments();
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(screen.getByText('Todavía no hay comentarios.')).toBeTruthy());
    expect(mockedLoadComments).toHaveBeenLastCalledWith(shiftId);
  });
});
