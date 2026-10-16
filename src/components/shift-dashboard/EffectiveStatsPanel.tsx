import { useMemo, useState } from 'react';
import { AlertTriangle, Settings2 } from 'lucide-react';
import type { Shift } from '../../lib/types';
import { computeEffectiveStats, evaluateAnnualTarget, splitMinutes } from '../../lib/effective-calendar.js';
import type { ContractEvaluation, StatsBucket } from '../../lib/effective-calendar.js';
import { useI18n } from '../../lib/use-i18n';
import './EffectiveStatsPanel.css';

export interface AnnualTargetValue {
  minimumAnnualMinutes: number;
  maximumAnnualMinutes: number;
}

interface EffectiveStatsPanelProps {
  /** Rows of the displayed month (effective calendar source). */
  monthShifts: Shift[];
  /** Rows of the displayed year. */
  yearShifts: Shift[];
  year: number;
  monthLabel: string;
  monthRange: { from: string; to: string };
  /** Operational "today": earlier dates are realised, later ones are planned. */
  today: string;
  target: AnnualTargetValue | null;
  canConfigureTarget: boolean;
  /** Targets only exist for backend sessions; hidden in local-first mode. */
  showContract: boolean;
  onConfigureTarget?: () => void;
  onOpenDay?: (date: string) => void;
}

type Translate = (key: string, params?: Record<string, string | number>) => string;

function formatDuration(minutes: number, t: Translate, locale: string): string {
  const { sign, hours, minutes: mins } = splitMinutes(minutes);
  const prefix = sign < 0 ? '−' : '';
  const hoursText = hours.toLocaleString(locale === 'en' ? 'en-GB' : 'es-ES');
  if (mins === 0) return prefix + t('effectiveStats.hoursValue', { hours: hoursText });
  if (hours === 0) return prefix + t('effectiveStats.minutesValue', { minutes: mins });
  return prefix + t('effectiveStats.hoursMinutesValue', { hours: hoursText, minutes: mins });
}

function Metric({ label, value, testId, emphasis = false }: { label: string; value: string; testId?: string; emphasis?: boolean }) {
  return (
    <div className={emphasis ? 'eff-metric eff-metric--primary' : 'eff-metric'} data-testid={testId}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function PeriodCard({
  heading, headingId, bucket, planned, expanded, onToggle, t, locale, testId,
}: {
  heading: string;
  headingId: string;
  bucket: StatsBucket;
  planned: StatsBucket;
  expanded: boolean;
  onToggle: () => void;
  t: Translate;
  locale: string;
  testId: string;
}) {
  const days = (count: number) => t('effectiveStats.daysValue', { count });
  return (
    <article className="eff-card" aria-labelledby={headingId} data-testid={testId}>
      <h3 id={headingId} className="eff-card__title">{heading}</h3>
      <dl className="eff-metrics">
        <Metric emphasis label={t('effectiveStats.realizedHours')} value={formatDuration(bucket.effectiveMinutes, t, locale)} testId={`${testId}-effective`} />
        <Metric label={t('effectiveStats.regular')} value={formatDuration(bucket.regularMinutes, t, locale)} testId={`${testId}-regular`} />
        <Metric label={t('effectiveStats.extras')} value={formatDuration(bucket.extrasMinutes, t, locale)} testId={`${testId}-extras`} />
        <Metric label={t('effectiveStats.absences')} value={formatDuration(bucket.absenceMinutes, t, locale)} testId={`${testId}-absence`} />
      </dl>
      {planned.effectiveMinutes > 0 && (
        <p className="eff-card__planned" data-testid={`${testId}-planned`}>
          {t('effectiveStats.plannedFuture')}: <strong>{formatDuration(planned.effectiveMinutes, t, locale)}</strong>
        </p>
      )}
      <button
        type="button"
        className="eff-card__toggle"
        aria-expanded={expanded}
        aria-controls={`${headingId}-more`}
        onClick={onToggle}
      >
        {expanded ? t('effectiveStats.hideDetails') : t('effectiveStats.showDetails')}
      </button>
      <dl id={`${headingId}-more`} className={expanded ? 'eff-metrics eff-metrics--more is-expanded' : 'eff-metrics eff-metrics--more'}>
        <Metric label={t('effectiveStats.workedDays')} value={days(bucket.workedDays)} testId={`${testId}-worked-days`} />
        <Metric label={t('effectiveStats.freeDays')} value={days(bucket.freeDays)} testId={`${testId}-free-days`} />
        <Metric label={t('effectiveStats.vacationDays')} value={days(bucket.vacationDays)} testId={`${testId}-vacation-days`} />
        <Metric label={t('effectiveStats.sickLeaveDays')} value={days(bucket.sickLeaveDays)} testId={`${testId}-sick-days`} />
      </dl>
    </article>
  );
}

function ContractCard({
  year, target, evaluation, plannedMinutes, canConfigure, onConfigure, t, locale,
}: {
  year: number;
  target: AnnualTargetValue | null;
  evaluation: ContractEvaluation;
  plannedMinutes: number;
  canConfigure: boolean;
  onConfigure?: () => void;
  t: Translate;
  locale: string;
}) {
  const heading = t('effectiveStats.contractHeading', { year });
  if (!target || evaluation.status === 'UNCONFIGURED') {
    return (
      <article className="eff-card eff-card--contract" aria-labelledby="eff-contract-heading" data-testid="eff-contract-card">
        <h3 id="eff-contract-heading" className="eff-card__title">{heading}</h3>
        <p className="eff-contract__empty" data-testid="eff-contract-unconfigured">{t('effectiveStats.notConfigured')}</p>
        {canConfigure && onConfigure && (
          <button type="button" className="eff-button" onClick={onConfigure} data-testid="eff-contract-configure">
            <Settings2 size={14} aria-hidden="true" /> {t('effectiveStats.configure')}
          </button>
        )}
      </article>
    );
  }

  const minimum = evaluation.minimumMinutes ?? 0;
  const maximum = evaluation.maximumMinutes ?? 0;
  const effective = evaluation.effectiveMinutes;
  const scale = Math.max(maximum, effective, 1);
  const fill = Math.min(100, (effective / scale) * 100);
  const minMarker = Math.min(100, (minimum / scale) * 100);
  const statusText = evaluation.status === 'BELOW_MINIMUM'
    ? t('effectiveStats.statusBelow', { amount: formatDuration(evaluation.missingToMinimumMinutes ?? 0, t, locale) })
    : evaluation.status === 'ABOVE_MAXIMUM'
      ? t('effectiveStats.statusAbove', { amount: formatDuration(evaluation.excessOverMaximumMinutes ?? 0, t, locale) })
      : t('effectiveStats.statusWithin');

  return (
    <article className="eff-card eff-card--contract" aria-labelledby="eff-contract-heading" data-testid="eff-contract-card">
      <div className="eff-card__title-row">
        <h3 id="eff-contract-heading" className="eff-card__title">{heading}</h3>
        {canConfigure && onConfigure && (
          <button type="button" className="eff-button eff-button--ghost" onClick={onConfigure} data-testid="eff-contract-edit">
            <Settings2 size={14} aria-hidden="true" /> {t('effectiveStats.editTarget')}
          </button>
        )}
      </div>
      <p className={`eff-status eff-status--${evaluation.status.toLowerCase()}`} data-testid="eff-contract-status" data-status={evaluation.status}>
        <span className="eff-status__label">{t('effectiveStats.statusLabel')}:</span> {statusText}
      </p>
      <div
        className="eff-progress"
        role="progressbar"
        aria-label={t('effectiveStats.progressLabel')}
        aria-valuemin={0}
        aria-valuemax={Math.max(maximum, effective)}
        aria-valuenow={effective}
        aria-valuetext={`${formatDuration(effective, t, locale)} / ${formatDuration(maximum, t, locale)}`}
      >
        <div className="eff-progress__fill" style={{ width: `${fill}%` }} />
        <div className="eff-progress__marker" style={{ left: `${minMarker}%` }} aria-hidden="true" />
      </div>
      <dl className="eff-metrics eff-metrics--contract">
        <Metric label={t('effectiveStats.effectiveSoFar')} value={formatDuration(effective, t, locale)} testId="eff-contract-effective" />
        <Metric label={t('effectiveStats.minimum')} value={formatDuration(minimum, t, locale)} testId="eff-contract-minimum" />
        <Metric label={t('effectiveStats.maximum')} value={formatDuration(maximum, t, locale)} testId="eff-contract-maximum" />
        <Metric label={t('effectiveStats.margin')} value={formatDuration(evaluation.marginMinutes ?? 0, t, locale)} testId="eff-contract-margin" />
        <Metric label={t('effectiveStats.marginUsed')} value={formatDuration(evaluation.marginUsedMinutes ?? 0, t, locale)} testId="eff-contract-margin-used" />
        <Metric label={t('effectiveStats.marginRemaining')} value={formatDuration(evaluation.marginRemainingMinutes ?? 0, t, locale)} testId="eff-contract-margin-remaining" />
      </dl>
      {plannedMinutes > 0 && (
        <p className="eff-card__planned" data-testid="eff-contract-projection">
          {t('effectiveStats.projection')}: <strong>{formatDuration(effective + plannedMinutes, t, locale)}</strong>
        </p>
      )}
      <p className="eff-card__disclaimer">{t('effectiveStats.disclaimer')}</p>
    </article>
  );
}

/**
 * Month / year statistics computed ONLY from the effective calendar.
 * Replaces the legacy "Propios" / "Empresa" accumulators: provenance no
 * longer decides what is counted.
 */
export function EffectiveStatsPanel({
  monthShifts, yearShifts, year, monthLabel, monthRange, today, target,
  canConfigureTarget, showContract, onConfigureTarget, onOpenDay,
}: EffectiveStatsPanelProps) {
  const { t, locale } = useI18n();
  const [monthExpanded, setMonthExpanded] = useState(false);
  const [yearExpanded, setYearExpanded] = useState(false);

  const monthStats = useMemo(
    () => computeEffectiveStats(monthShifts, { from: monthRange.from, to: monthRange.to, today }),
    [monthShifts, monthRange.from, monthRange.to, today],
  );
  const yearStats = useMemo(
    () => computeEffectiveStats(yearShifts, { from: `${year}-01-01`, to: `${year}-12-31`, today }),
    [yearShifts, year, today],
  );
  const evaluation = useMemo(
    () => evaluateAnnualTarget(yearStats.realized.effectiveMinutes, target),
    [yearStats.realized.effectiveMinutes, target],
  );

  const unresolved = yearStats.unresolved;
  const unresolvedDates = unresolved.slice(0, 5).map((entry) => entry.date).join(', ');

  return (
    <aside className="eff-stats" aria-label={t('effectiveStats.regionLabel')} data-testid="effective-stats-panel">
      {unresolved.length > 0 && (
        <div className="eff-alert" role="status" data-testid="eff-unresolved-alert">
          <AlertTriangle size={16} aria-hidden="true" />
          <div>
            <strong>
              {unresolved.length === 1
                ? t('effectiveStats.unresolvedOne')
                : t('effectiveStats.unresolvedMany', { count: unresolved.length })}
            </strong>
            <span>{t('effectiveStats.unresolvedHint', { dates: unresolvedDates })}</span>
            {onOpenDay && (
              <span className="eff-alert__links">
                {unresolved.slice(0, 5).map((entry) => (
                  <button key={entry.date} type="button" className="eff-link" onClick={() => onOpenDay(entry.date)}>
                    {entry.date}
                  </button>
                ))}
              </span>
            )}
          </div>
        </div>
      )}
      <div className="eff-stats__grid">
        <PeriodCard
          heading={t('effectiveStats.monthHeading', { label: monthLabel })}
          headingId="eff-month-heading"
          testId="eff-month"
          bucket={monthStats.realized}
          planned={monthStats.planned}
          expanded={monthExpanded}
          onToggle={() => setMonthExpanded((value) => !value)}
          t={t}
          locale={locale}
        />
        <PeriodCard
          heading={t('effectiveStats.yearHeading', { year })}
          headingId="eff-year-heading"
          testId="eff-year"
          bucket={yearStats.realized}
          planned={yearStats.planned}
          expanded={yearExpanded}
          onToggle={() => setYearExpanded((value) => !value)}
          t={t}
          locale={locale}
        />
        {showContract && (
          <ContractCard
            year={year}
            target={target}
            evaluation={evaluation}
            plannedMinutes={yearStats.planned.effectiveMinutes}
            canConfigure={canConfigureTarget}
            onConfigure={onConfigureTarget}
            t={t}
            locale={locale}
          />
        )}
      </div>
    </aside>
  );
}
