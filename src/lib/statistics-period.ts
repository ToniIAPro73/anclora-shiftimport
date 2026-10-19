import type { StatsBucket } from './effective-calendar.js';

export type StatisticsMonthRelation = 'PAST' | 'CURRENT' | 'FUTURE';

/** Compare calendar month keys so browser timezone offsets cannot change the result. */
export function getStatisticsMonthRelation(year: number, month: number, today: string): StatisticsMonthRelation {
  const selectedMonth = `${year}-${String(month + 1).padStart(2, '0')}`;
  const currentMonth = today.slice(0, 7);
  if (selectedMonth < currentMonth) return 'PAST';
  if (selectedMonth > currentMonth) return 'FUTURE';
  return 'CURRENT';
}

export function statsBucketHasData(bucket: StatsBucket): boolean {
  return bucket.effectiveMinutes !== 0
    || bucket.regularMinutes !== 0
    || bucket.extrasMinutes !== 0
    || bucket.otherWorkMinutes !== 0
    || bucket.unclassifiedWorkMinutes !== 0
    || bucket.absenceMinutes !== 0
    || bucket.dutyMinutes !== 0
    || bucket.dutyDays !== 0
    || bucket.workedDays !== 0
    || bucket.freeDays !== 0
    || bucket.vacationDays !== 0
    || bucket.sickLeaveDays !== 0;
}
