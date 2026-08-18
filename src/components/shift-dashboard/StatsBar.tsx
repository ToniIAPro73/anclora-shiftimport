import { useMemo } from 'react';
import { Shift, ShiftOrigin, WeeklyStats } from '../../lib/types';
import { aggregateWeeklyStats, filterShiftsByOrigin } from '../../lib/shifts';
import { getShiftTypes } from '../../lib/shift-types';
import { Locale, translateShiftTypeLabel } from '../../lib/i18n';
import { useI18n } from '../../lib/use-i18n';

interface StatsBarProps {
  currentMonthShifts: Shift[];
  daysInMonth: number;
  currentYearShifts: Shift[];
  daysInYear: number;
}

function buildOriginStats(shifts: Shift[], totalDays: number, origin: ShiftOrigin) {
  return aggregateWeeklyStats(filterShiftsByOrigin(shifts, origin), totalDays);
}

type StatsCell =
  | { kind: 'section'; label: string }
  | { kind: 'token'; label: string; value: string; className?: string };

function TotalToken({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <span className={`totals-token ${className ?? ''}`.trim()}>
      <strong>{label}</strong> {value}
    </span>
  );
}

function SectionToken({ label }: { label: string }) {
  return <span className="totals-section-label totals-section-token">{label}</span>;
}

function formatTokenValue(hours: number, days: number): string {
  return `${hours.toFixed(1)}h / ${days}d`;
}

function buildTypeCells(stats: WeeklyStats, locale: Locale): StatsCell[] {
  return getShiftTypes().map((type) => ({
    kind: 'token' as const,
    label: translateShiftTypeLabel(type.id, locale, type.shortLabel),
    value: formatTokenValue(stats.hoursByType[type.id] ?? 0, stats.daysByType[type.id] ?? 0),
    className: `type-${type.id.toLowerCase()}`,
  }));
}

function buildSummaryCells(monthStats: WeeklyStats, yearStats: WeeklyStats, locale: Locale, t: (key: string) => string): StatsCell[] {
  return [
    { kind: 'section', label: t('stats.totalMonth') },
    { kind: 'token', label: t('stats.month'), value: formatTokenValue(monthStats.totalWorkedHours, monthStats.totalWorkedDays) },
    ...buildTypeCells(monthStats, locale),
    { kind: 'section', label: t('stats.totalYear') },
    { kind: 'token', label: t('stats.year'), value: formatTokenValue(yearStats.totalWorkedHours, yearStats.totalWorkedDays) },
    ...buildTypeCells(yearStats, locale),
  ];
}

function measureText(text: string, font: string, letterSpacingPx: number = 0): number {
  if (typeof document === 'undefined') {
    return (text.length * 8) + Math.max(0, text.length - 1) * letterSpacingPx;
  }

  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) {
    return (text.length * 8) + Math.max(0, text.length - 1) * letterSpacingPx;
  }

  context.font = font;
  return context.measureText(text).width + (Math.max(0, text.length - 1) * letterSpacingPx);
}

function getCellContentWidth(cell: StatsCell, sectionFont: string, tokenFont: string, sectionLetterSpacing: number, tokenLetterSpacing: number): number {
  if (cell.kind === 'section') {
    return measureText(cell.label, sectionFont, sectionLetterSpacing);
  }

  return measureText(`${cell.label} ${cell.value}`, tokenFont, tokenLetterSpacing);
}

function buildSharedColumnWidths(
  titles: string[],
  rows: StatsCell[][],
): { titleColumnWidth: string; gridTemplateColumns: string } {
  const rootFontSize = typeof window === 'undefined'
    ? 16
    : Number.parseFloat(window.getComputedStyle(document.documentElement).fontSize || '16');
  const tokenFont = `700 ${0.62 * rootFontSize}px Inter, system-ui, sans-serif`;
  const sectionFont = `800 ${0.58 * rootFontSize}px Inter, system-ui, sans-serif`;
  const titleFont = `800 ${0.72 * rootFontSize}px Inter, system-ui, sans-serif`;
  const tokenLetterSpacing = 0.05 * (0.58 * rootFontSize);
  const sectionLetterSpacing = 0.05 * (0.58 * rootFontSize);
  const sidePadding = 10;

  const titleContentWidth = Math.max(...titles.map((title) => measureText(title, titleFont)));
  const columnContentWidths = rows[0].map((_, index) =>
    Math.max(...rows.map((row) =>
      getCellContentWidth(row[index], sectionFont, tokenFont, sectionLetterSpacing, tokenLetterSpacing),
    )),
  );
  const sectionColumnIndexes = rows[0]
    .map((cell, index) => cell.kind === 'section' ? index : -1)
    .filter((index) => index >= 0);

  const sharedFixedWidth = Math.ceil(
    Math.max(
      titleContentWidth + 5,
      ...sectionColumnIndexes.map((index) => columnContentWidths[index] + sidePadding),
    ),
  );

  const contentWidths = columnContentWidths.map((width, index) => {
    if (sectionColumnIndexes.includes(index)) return sharedFixedWidth;
    return Math.ceil(width + sidePadding);
  });

  return {
    titleColumnWidth: `${sharedFixedWidth}px`,
    gridTemplateColumns: contentWidths.map((width) => `${width}px`).join(' '),
  };
}

function SummaryLine({
  title,
  cells,
  gridTemplateColumns,
  titleColumnWidth,
}: {
  title: string;
  cells: StatsCell[];
  gridTemplateColumns: string;
  titleColumnWidth: string;
}) {
  return (
    <div className="totals-line" style={{ gridTemplateColumns: `${titleColumnWidth} max-content` }}>
      <div className="totals-line-title">{title}</div>
      <div className="totals-line-values" style={{ gridTemplateColumns }}>
        {cells.map((cell, index) =>
          cell.kind === 'section'
            ? <SectionToken key={`${title}-section-${index}`} label={cell.label} />
            : <TotalToken key={`${title}-token-${index}`} label={cell.label} value={cell.value} className={cell.className} />
        )}
      </div>
    </div>
  );
}

export const StatsBar = ({ currentMonthShifts, daysInMonth, currentYearShifts, daysInYear }: StatsBarProps) => {
  const { locale, t } = useI18n();
  const ownMonthStats = useMemo(() => buildOriginStats(currentMonthShifts, daysInMonth, 'MAN'), [currentMonthShifts, daysInMonth]);
  const ownYearStats = useMemo(() => buildOriginStats(currentYearShifts, daysInYear, 'MAN'), [currentYearShifts, daysInYear]);
  const companyMonthStats = useMemo(() => buildOriginStats(currentMonthShifts, daysInMonth, 'IMP'), [currentMonthShifts, daysInMonth]);
  const companyYearStats = useMemo(() => buildOriginStats(currentYearShifts, daysInYear, 'IMP'), [currentYearShifts, daysInYear]);
  const ownCells = useMemo(() => buildSummaryCells(ownMonthStats, ownYearStats, locale, t), [ownMonthStats, ownYearStats, locale, t]);
  const companyCells = useMemo(() => buildSummaryCells(companyMonthStats, companyYearStats, locale, t), [companyMonthStats, companyYearStats, locale, t]);
  const ownTitle = t('stats.own');
  const companyTitle = t('stats.company');
  const { titleColumnWidth, gridTemplateColumns } = useMemo(
    () => buildSharedColumnWidths([ownTitle, companyTitle], [ownCells, companyCells]),
    [ownTitle, companyTitle, ownCells, companyCells],
  );

  return (
    <div className="totals-ribbon">
      <SummaryLine title={ownTitle} cells={ownCells} gridTemplateColumns={gridTemplateColumns} titleColumnWidth={titleColumnWidth} />
      <SummaryLine title={companyTitle} cells={companyCells} gridTemplateColumns={gridTemplateColumns} titleColumnWidth={titleColumnWidth} />
    </div>
  );
};
