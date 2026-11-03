// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { I18nProvider } from '../../lib/i18n-react';
import * as remote from '../../lib/remote';
import { RequestCenterModal, type RequestCenterTab } from './RequestCenterModal';

vi.mock('../../lib/remote', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/remote')>();
  return { ...actual, listRemoteApprovals: vi.fn() };
});
const mockedList = vi.mocked(remote.listRemoteApprovals);

function renderCenter(props: Partial<React.ComponentProps<typeof RequestCenterModal>> = {}) {
  return render(
    <I18nProvider>
      <RequestCenterModal isOpen onClose={() => {}} canManage hasEmployee mine={<div data-testid="mine-slot">Mis cosas</div>} {...props} />
    </I18nProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedList.mockResolvedValue({ requests: [], nextCursor: null });
});
afterEach(cleanup);

const tabIds = () => screen.queryAllByRole('tab').map((tab) => tab.getAttribute('data-testid'));

describe('RequestCenterModal', () => {
  it('managers with a linked employee get pending, history and mine, starting on pending', async () => {
    renderCenter({ pendingCount: 3 });
    expect(tabIds()).toEqual(['request-center-tab-pending', 'request-center-tab-history', 'request-center-tab-mine']);
    expect(screen.getByTestId('request-center-tab-pending')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('request-center-tab-pending')).toHaveAccessibleName('Pendientes del equipo (3)');
    await waitFor(() => expect(mockedList).toHaveBeenCalledWith(expect.objectContaining({ status: 'PENDING' })));
    expect(screen.queryByTestId('mine-slot')).toBeNull();
  });

  it('a manager without a linked employee has no "Mis solicitudes"', () => {
    renderCenter({ hasEmployee: false });
    expect(tabIds()).toEqual(['request-center-tab-pending', 'request-center-tab-history']);
  });

  it('a role without management only gets "Mis solicitudes" and never reads the team feed', () => {
    renderCenter({ canManage: false });
    expect(screen.queryAllByRole('tab')).toHaveLength(0); // a single section needs no tab bar
    expect(screen.getByTestId('mine-slot')).toBeInTheDocument();
    expect(mockedList).not.toHaveBeenCalled();
  });

  it('renders nothing for a user who can neither manage nor has an employee', () => {
    renderCenter({ canManage: false, hasEmployee: false });
    expect(screen.queryByTestId('request-center')).toBeNull();
    expect(mockedList).not.toHaveBeenCalled();
  });

  it('opens on the requested tab (the sidebar "Mis solicitudes" entry)', () => {
    renderCenter({ initialTab: 'mine' as RequestCenterTab });
    expect(screen.getByTestId('request-center-tab-mine')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('mine-slot')).toBeInTheDocument();
    expect(mockedList).not.toHaveBeenCalled();
  });

  it('a requested tab the role does not have falls back to the first one', () => {
    renderCenter({ canManage: false, hasEmployee: true, initialTab: 'pending' });
    expect(screen.getByTestId('mine-slot')).toBeInTheDocument();
  });

  it('switches to the history feed with the keyboard (arrow keys) and labels the panel by the active tab', async () => {
    renderCenter();
    const pending = screen.getByTestId('request-center-tab-pending');
    pending.focus();
    fireEvent.keyDown(pending, { key: 'ArrowRight' });
    await waitFor(() => expect(mockedList).toHaveBeenCalledWith(expect.objectContaining({ status: 'HISTORY' })));
    expect(screen.getByTestId('request-center-tab-history')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', 'request-center-tab-history');
  });
});
