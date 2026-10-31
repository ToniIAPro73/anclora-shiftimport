import { getOperationalDate } from './operational-date';

export const MAX_TIME_OFF_DAYS = 366;
export const MAX_TIME_OFF_COMMENT_LENGTH = 2000;

export type TimeOffField = 'startDate' | 'endDate' | 'comment';
export type TimeOffFieldErrorKey =
  | 'timeOff.errorStartRequired'
  | 'timeOff.errorEndRequired'
  | 'timeOff.errorRange'
  | 'timeOff.errorPast'
  | 'timeOff.errorTooLong'
  | 'timeOff.errorCommentTooLong';

export interface TimeOffFieldError {
  field: TimeOffField;
  key: TimeOffFieldErrorKey;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const isIsoDate = (value: string): boolean => ISO_DATE.test(value) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());

/** Inclusive calendar days between two ISO dates (the "N días naturales" pill). */
export function countTimeOffDays(startDate: string, endDate: string): number {
  const ms = new Date(`${endDate}T00:00:00Z`).getTime() - new Date(`${startDate}T00:00:00Z`).getTime();
  return Math.round(ms / 86_400_000) + 1;
}

/** Client mirror of the server rules (the server stays authoritative): end ≥ start, start ≥ today, ≤ 366 days, comment ≤ 2000. */
export function validateTimeOffForm(
  values: { startDate: string; endDate: string; comment: string },
  today: string = getOperationalDate(),
): TimeOffFieldError[] {
  const errors: TimeOffFieldError[] = [];
  const { startDate, endDate, comment } = values;
  if (!isIsoDate(startDate)) errors.push({ field: 'startDate', key: 'timeOff.errorStartRequired' });
  else if (startDate < today) errors.push({ field: 'startDate', key: 'timeOff.errorPast' });
  if (!isIsoDate(endDate)) errors.push({ field: 'endDate', key: 'timeOff.errorEndRequired' });
  else if (isIsoDate(startDate) && endDate < startDate) errors.push({ field: 'endDate', key: 'timeOff.errorRange' });
  else if (isIsoDate(startDate) && countTimeOffDays(startDate, endDate) > MAX_TIME_OFF_DAYS) errors.push({ field: 'endDate', key: 'timeOff.errorTooLong' });
  if (comment.length > MAX_TIME_OFF_COMMENT_LENGTH) errors.push({ field: 'comment', key: 'timeOff.errorCommentTooLong' });
  return errors;
}

/** Server `code` → the five-question explanation (what / written / not written / why / what to do), §15. */
export function describeTimeOffError(code: string | undefined): { whyKey: string; actionKey: string } {
  switch (code) {
    case 'TIME_OFF_OVERLAP': return { whyKey: 'timeOff.errorOverlap', actionKey: 'timeOff.actionOverlap' };
    case 'TIME_OFF_TYPE_NOT_ENABLED': return { whyKey: 'timeOff.errorNotEnabled', actionKey: 'timeOff.actionNotEnabled' };
    case 'TIME_OFF_PAST_DATE': return { whyKey: 'timeOff.errorPast', actionKey: 'timeOff.actionPast' };
    case 'TIME_OFF_RANGE_TOO_LONG': return { whyKey: 'timeOff.errorTooLong', actionKey: 'timeOff.actionTooLong' };
    case 'EMPLOYEE_LINK_REQUIRED': return { whyKey: 'timeOff.errorLink', actionKey: 'timeOff.actionLink' };
    default: return { whyKey: 'timeOff.whyGeneric', actionKey: 'timeOff.actionGeneric' };
  }
}
