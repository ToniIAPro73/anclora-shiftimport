import { ReactNode, useEffect, useRef } from 'react';
import { X } from 'lucide-react';

/**
 * Shared modal shell (Fase 1.1). Single implementation of the Anclora modal
 * behavior contract for all new modals: backdrop separating surface from
 * background (blur), visible close top-right, ESC close, click-outside close,
 * focus trap, initial focus, focus return, ARIA dialog semantics.
 * `prefers-reduced-motion` is honored via the modal-overlay/modal-content CSS.
 */
interface ModalShellProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Footer actions (secondary left, primary right per contract). */
  footer?: ReactNode;
  maxWidth?: string;
  closeAriaLabel?: string;
  /** Blocking dialogs (e.g. mandatory organization choice): hides the X and
   * disables ESC/click-outside. Only use when closing makes no sense. */
  blocking?: boolean;
  /** A secondary panel/section owns ESC right now (e.g. a bulk-action
   * drawer) — this modal must not close until that panel handles it and
   * clears the flag. Unlike `blocking`, the X and click-outside still work. */
  suppressEscape?: boolean;
  /** Wide admin-workspace layout (MembersModal): fixed-height shell sized from
   * the viewport, no outer scroll — the header/footer stay fixed and only the
   * inner regions the caller marks scrollable actually scroll. This kills the
   * intermittent outer scrollbar that appeared/disappeared with async loads. */
  workspace?: boolean;
}

export const ModalShell = ({
  isOpen,
  onClose,
  title,
  children,
  footer,
  maxWidth = '480px',
  closeAriaLabel = 'Close',
  blocking = false,
  suppressEscape = false,
  workspace = false,
}: ModalShellProps) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    previousFocusRef.current = document.activeElement as HTMLElement | null;

    const focusables = () => Array.from(
      contentRef.current?.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      ) ?? [],
    ).filter((element) => !element.hasAttribute('disabled'));

    // Initial focus: first focusable, falling back to the dialog itself.
    const initial = focusables()[0] ?? contentRef.current;
    initial?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (blocking || suppressEscape) {
          return;
        }
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab') {
        return;
      }
      const items = focusables();
      if (items.length === 0) {
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      previousFocusRef.current?.focus();
    };
  }, [isOpen, onClose, blocking, suppressEscape]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="modal-overlay"
      onMouseDown={(event) => {
        if (!blocking && event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={contentRef}
        className={workspace ? 'modal-content modal-content--workspace' : 'modal-content'}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        style={workspace
          // Fixed-height shell: the card itself never scrolls, so open/load/
          // reopen all produce the same geometry regardless of async content.
          ? { maxWidth, height: 'min(86vh, 920px)', maxHeight: 'calc(100dvh - 24px)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }
          : { maxWidth, maxHeight: '90vh', overflowY: 'auto' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', gap: '12px', flexShrink: 0 }}>
          <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800 }}>{title}</h2>
          {!blocking && (
            <button type="button" className="theme-toggle" onClick={onClose} aria-label={closeAriaLabel}>
              <X size={18} aria-hidden="true" />
            </button>
          )}
        </div>
        <div style={workspace ? { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' } : undefined}>{children}</div>
        {footer && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', flexWrap: 'wrap', marginTop: '16px', flexShrink: 0 }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
