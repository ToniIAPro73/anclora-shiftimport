import { ModalShell } from '../ui/ModalShell';
import { useI18n } from '../../lib/use-i18n';
import { ApprovalInbox } from './ApprovalInbox';

interface ApprovalInboxModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/** Approval Lite keeps its existing data/actions component; P5.2 only changes
 * its presentation entry point so the calendar remains the primary workspace. */
export function ApprovalInboxModal({ isOpen, onClose }: ApprovalInboxModalProps) {
  const { t } = useI18n();
  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title={t('approvalInbox.navLabel')}
      closeAriaLabel={t('common.close')}
      workspace
      maxWidth="980px"
    >
      <div className="approval-inbox-modal-body">
        <ApprovalInbox />
      </div>
    </ModalShell>
  );
}
