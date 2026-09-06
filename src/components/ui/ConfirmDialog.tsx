import type { ReactNode } from 'react';
import { useState } from 'react';
import { useI18n } from '../../lib/use-i18n';
import { ModalShell } from './ModalShell';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

/** Contract-compliant destructive confirmation. Escape, outside click and
 * the safe action always cancel; the destructive action is disabled while its
 * callback is running so a double click cannot duplicate a mutation. */
export const ConfirmDialog = ({
  isOpen, title, description, confirmLabel, cancelLabel, onConfirm, onCancel,
}: ConfirmDialogProps) => {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onCancel}
      title={title}
      dialogRole="alertdialog"
      initialFocus="#confirm-dialog-cancel"
      closeAriaLabel={t('common.close')}
      footer={(
        <>
          <button id="confirm-dialog-cancel" type="button" className="btn-outline" onClick={onCancel} disabled={busy} style={{ padding: '9px 14px', fontWeight: 700 }}>
            {cancelLabel}
          </button>
          <button type="button" className="btn-gold" onClick={() => void confirm()} disabled={busy} aria-busy={busy} style={{ padding: '9px 14px', fontWeight: 800 }}>
            {confirmLabel}
          </button>
        </>
      )}
    >
      <p style={{ margin: 0, color: 'var(--text-muted)', lineHeight: 1.5 }}>{description}</p>
    </ModalShell>
  );
};
