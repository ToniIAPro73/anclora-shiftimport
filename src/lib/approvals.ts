import type { ApprovalItem } from './remote';

/** Server limit of `POST /api/approval-requests/bulk-approve` (spec §4.3.3). */
export const BULK_APPROVE_MAX = 50;

/**
 * Whether the UI offers Approve / Reject. This is a convenience, never the authorisation: the server re-evaluates scope, policy and
 * anti-self-approval for every decision. TIME_OFF items carry the server's own verdict (`canDecide`); legacy shift changes are already
 * filtered by the server, so only the own-request guard applies on the client.
 */
export function isDecidable(item: ApprovalItem, currentEmployeeId?: string | null): boolean {
  if (item.status !== 'PENDING') return false;
  if (item.kind === 'TIME_OFF') return item.canDecide;
  return !(currentEmployeeId && item.employeeId === currentEmployeeId);
}

/** i18n key explaining why a pending item cannot be decided (null when it can, or when the reason is unknown). */
export function cannotDecideKey(item: ApprovalItem, currentEmployeeId?: string | null): string | null {
  if (item.status !== 'PENDING' || isDecidable(item, currentEmployeeId)) return null;
  const reason = item.kind === 'TIME_OFF'
    ? item.cannotDecideReason
    : (currentEmployeeId && item.employeeId === currentEmployeeId ? 'SELF_REQUEST' : null);
  if (!reason) return null;
  return reason === 'SELF_REQUEST' ? 'approvalInbox.selfApprovalForbidden' : `approvalInbox.cannot.${reason}`;
}

/** Only pending vacation requests the actor can decide take part in a bulk approval (shift changes are never bulk). */
export function bulkSelectable(item: ApprovalItem): item is Extract<ApprovalItem, { kind: 'TIME_OFF' }> {
  return item.kind === 'TIME_OFF' && item.status === 'PENDING' && item.canDecide;
}
