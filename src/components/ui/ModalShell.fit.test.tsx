// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ModalShell } from './ModalShell';

afterEach(cleanup);

describe('ModalShell fitViewport (additive: other modals keep their 90vh cap)', () => {
  it('lets a regular modal use the whole viewport height before it scrolls', () => {
    render(<ModalShell isOpen onClose={() => {}} title="A" fitViewport><p>x</p></ModalShell>);
    const dialog = screen.getByRole('dialog');
    expect(dialog.style.maxHeight).toBe('calc(100dvh - 24px)');
    expect(dialog.style.overflowY).toBe('auto'); // content that still does not fit scrolls instead of being clipped
  });
  it('default behaviour is unchanged', () => {
    render(<ModalShell isOpen onClose={() => {}} title="B"><p>x</p></ModalShell>);
    expect(screen.getByRole('dialog').style.maxHeight).toBe('90vh');
  });
});
