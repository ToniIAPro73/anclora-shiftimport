import { useEffect, useMemo, useRef, useState } from 'react';
import { Settings2 } from 'lucide-react';
import type { Shift } from '../../lib/types';
import { computeEffectiveStats, evaluateAnnualTarget } from '../../lib/effective-calendar.js';
import type { ContractEvaluation, StatsBucket } from '../../lib/effective-calendar.js';
import { loadCalendarStats, type RemoteCalendarStats } from '../../lib/remote';
import { useI18n } from '../../lib/use-i18n';
import { formatDuration } from './format-duration';
import { ModalShell } from '../ui/ModalShell';
import './EffectiveStatsPanel.css';
import './CalendarModals.css';

export interface AnnualTargetValue {
  minimumAnnualMinutes: number;
  maximumAnnualMinutes: number;
}

type Tab = 'month' | 'year' | 'target';
type Translate = (key: string, params?: Record<string, string | number>) => string;

interface StatsData {
  month: { realized: StatsBucket; planned: StatsBucket };
  year: { realized: StatsBucket; planned: StatsBucket };
  calendarRows: number;
  contract: ContractEvaluation;
}

interface StatisticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Backend sessions load the effective engine from the API; null = local-first. */
  employeeId: string | null;
  year: number;
  /** 0-based month, as used by the calendar. */
  month: number;
  monthLabel: string;
  today: string;
  target: AnnualTargetValue | null;
  canConfigureTarget: boolean;
  showContract: boolean;
  /** Bump to refetch after a day was reconciled/changed. */
  refreshKey?: number;
  /** Local-first fallback source (no API). */
  localMonthShifts?: Shift[];
  localYearShifts?: Shift[];
  onConfigureTarget?: () => void;
}

function Metric({ label, value, testId, emphasis = false }: { label: string; value: string; testId?: string; emphasis?: boolean }) {
  return (
    <div className={emphasis ? 'eff-metric eff-metric--primary' : 'eff-metric'} data-testid={testId}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function PeriodPanel({
  heading, realized, planned, plannedLabel, noData, t, locale, testId,
}: {
  heading: string;
  realized: StatsBucket;
  planned: StatsBucket;
  plannedLabel: string;
  noData: boolean;
  t: Translate;
  locale: string;
  testId: string;
}) {
  const days = (count: number) => t('effectiveStats.daysValue', { count });
  return (
    <section className="stats-modal__panel" aria-label={heading} data-testid={testId}>
      <h3 className="eff-card__title">{heading}</h3>
      {noData ? (
        <p className="eff-contract__empty" data-testid={`${testId}-no-data`}>{t('statsModal.noData')}</p>
      ) : (
        <>
          <dl className="eff-metrics stats-modal__metrics">
            <Metric emphasis label={t('effectiveStats.realizedHours')} value={formatDuration(realized.effectiveMinutes, t, locale)} testId={`${testId}-effective`} />
            <Metric label={t('effectiveStats.regular')} value={formatDuration(realized.regularMinutes, t, locale)} testId={`${testId}-regular`} />
            <Metric label={t('effectiveStats.extras')} value={formatDuration(realized.extrasMinutes, t, locale)} testId={`${testId}-extras`} />
            <Metric label={t('effectiveStats.absences')} value={formatDuration(realized.absenceMinutes, t, locale)} testId={`${testId}-absence`} />
            <Metric label={t('effectiveStats.workedDays')} value={days(realized.workedDays)} testId={`${testId}-worked-days`} />
            <Metric label={t('effectiveStats.freeDays')} value={days(realized.freeDays)} testId={`${testId}-free-days`} />
            <Metric label={t('effectiveStats.vacationDays')} value={days(realized.vacationDays)} testId={`${testId}-vacation-days`} />
            <Metric label={t('effectiveStats.sickLeaveDays')} value={days(realized.sickLeaveDays)} testId={`${testId}-sick-days`} />
          </dl>
          <p className="eff-card__planned" data-testid={`${testId}-planned`}>
            {plannedLabel}: <strong>{formatDuration(planned.effectiveMinutes, t, locale)}</strong>
          </p>
        </>
      )}
    </section>
  );
}

function TargetPanel({
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
  const heading = t('statsModal.targetHeading', { year });
  if (!target || evaluation.status === 'UNCONFIGURED') {
    return (
      <section className="stats-modal__panel" aria-label={heading} data-testid="eff-contract-card">
        <h3 className="eff-card__title">{heading}</h3>
        <p className="stats-modal__unconfigured" data-testid="eff-contract-unconfigured">{t('statsModal.targetUnconfigured')}</p>
        {canConfigure && onConfigure && (
          <button type="button" className="eff-button" onClick={onConfigure} data-testid="eff-contract-configure">
            <Settings2 size={14} aria-hidden="true" /> {t('statsModal.configureTarget')}
          </button>
        )}
        <p className="eff-card__disclaimer">{t('statsModal.configureHint')}</p>
      </section>
    );
  }

  const hoursText = (minutes: number) => Math.round(minutes / 60).toLocaleString(locale === 'en' ? 'en-GB' : 'es-ES');
  const range = t('statsModal.targetRange', { min: hoursText(target.minimumAnnualMinutes), max: hoursText(target.maximumAnnualMinutes) });

  if (evaluation.status === 'NO_DATA') {
    return (
      <section className="stats-modal__panel" aria-label={heading} data-testid="eff-contract-card">
        <h3 className="eff-card__title">{heading}</h3>
        <p className="stats-modal__unconfigured" data-testid="eff-contract-range">{range}</p>
        <p className="eff-status eff-status--no_data" data-testid="eff-contract-status" data-status="NO_DATA">
          <span className="eff-status__label">{t('effectiveStats.statusLabel')}:</span> {t('statsModal.statusNoData')}
        </p>
        {canConfigure && onConfigure && (
          <button type="button" className="eff-button eff-button--ghost" onClick={onConfigure} data-testid="eff-contract-edit">
            <Settings2 size={14} aria-hidden="true" /> {t('effectiveStats.editTarget')}
          </button>
        )}
      </section>
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
    <section className="stats-modal__panel" aria-label={heading} data-testid="eff-contract-card">
      <div className="eff-card__title-row">
        <h3 className="eff-card__title">{heading}</h3>
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
      <dl className="eff-metrics stats-modal__metrics">
        <Metric label={t('effectiveStats.effectiveSoFar')} value={formatDuration(effective, t, locale)} testId="eff-contract-effective" />
        <Metric label={t('effectiveStats.minimum')} value={formatDuration(minimum, t, locale)} testId="eff-contract-minimum" />
        <Metric label={t('effectiveStats.maximum')} value={formatDuration(maximum, t, locale)} testId="eff-contract-maximum" />
        <Metric label={t('effectiveStats.marginUsed')} value={formatDuration(evaluation.marginUsedMinutes ?? 0, t, locale)} testId="eff-contract-margin-used" />
        <Metric label={t('effectiveStats.marginRemaining')} value={formatDuration(evaluation.marginRemainingMinutes ?? 0, t, locale)} testId="eff-contract-margin-remaining" />
      </dl>
      {plannedMinutes > 0 && (
        <p className="eff-card__planned" data-testid="eff-contract-projection">
          {t('effectiveStats.projection')}: <strong>{formatDuration(effective + plannedMinutes, t, locale)}</strong>
        </p>
      )}
      <p className="eff-card__disclaimer">{t('effectiveStats.disclaimer')}</p>
    </section>
  );
}

/**
 * On-demand statistics (month / year / annual target). Numbers come from the
 * effective-calendar engine: the API for backend sessions, the same shared
 * engine over local rows in local-first mode. Provenance never decides what
 * is counted and future planned hours are never reported as realised.
 */
export function StatisticsModal({
  isOpen, onClose, employeeId, year, month, monthLabel, today, target, canConfigureTarget,
  showContract, refreshKey = 0, localMonthShifts, localYearShifts, onConfigureTarget,
}: StatisticsModalProps) {
  const { t, locale } = useI18n();
  const [tab, setTab] = useState<Tab>('month');
  const [remote, setRemote] = useState<RemoteCalendarStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({ month: null, year: null, target: null });

  useEffect(() => {
    if (!isOpen || !employeeId) return undefined;
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    loadCalendarStats(employeeId, year, month + 1)
      .then((stats) => { if (!cancelled) setRemote(stats); })
      .catch(() => { if (!cancelled) setFailed(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [isOpen, employeeId, year, month, refreshKey, attempt]);

  useEffect(() => { if (isOpen) setTab('month'); }, [isOpen]);

  const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`;
  const local = useMemo<StatsData | null>(() => {
    if (employeeId || !isOpen) return null;
    const monthStats = computeEffectiveStats(localMonthShifts ?? [], { from: `${monthPrefix}-01`, to: `${monthPrefix}-31`, today });
    const yearStats = computeEffectiveStats(localYearShifts ?? [], { from: `${year}-01-01`, to: `${year}-12-31`, today });
    return {
      month: { realized: monthStats.realized, planned: monthStats.planned },
      year: { realized: yearStats.realized, planned: yearStats.planned },
      calendarRows: yearStats.calendarRows,
      contract: evaluateAnnualTarget(yearStats.realized.effectiveMinutes, target, { calendarRows: yearStats.calendarRows }),
    };
  }, [employeeId, isOpen, localMonthShifts, localYearShifts, monthPrefix, today, year, target]);

  const data = useMemo<StatsData | null>(() => {
    if (!employeeId) return local;
    if (!remote || remote.year !== year || !remote.monthStats) return null;
    return {
      month: { realized: remote.monthStats.realized, planned: remote.monthStats.planned },
      year: { realized: remote.realized, planned: remote.planned },
      calendarRows: remote.calendarRows,
      contract: remote.contract,
    };
  }, [employeeId, local, remote, year]);

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'month', label: t('statsModal.tabMonth') },
    { id: 'year', label: t('statsModal.tabYear', { year }) },
    ...(showContract ? [{ id: 'target' as Tab, label: t('statsModal.tabTarget') }] : []),
  ];

  const onTabKeyDown = (event: React.KeyboardEvent, index: number) => {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = tabs[(index + step + tabs.length) % tabs.length];
    setTab(next.id);
    tabRefs.current[next.id]?.focus();
  };

  const monthNoData = data ? data.month.realized.effectiveMinutes === 0 && data.month.planned.effectiveMinutes === 0
    && data.month.realized.workedDays + data.month.realized.freeDays + data.month.realized.vacationDays + data.month.realized.sickLeaveDays === 0 : false;

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title={t('statsModal.title')}
      maxWidth="720px"
      width="100%"
      className="stats-modal"
      closeAriaLabel={t('common.close')}
      closeTestId="stats-modal-close"
    >
      <div data-testid="statistics-modal">
        <div className="stats-modal__tabs" role="tablist" aria-label={t('statsModal.tabsLabel')}>
          {tabs.map((entry, index) => (
            <button
              key={entry.id}
              ref={(element) => { tabRefs.current[entry.id] = element; }}
              type="button"
              role="tab"
              id={`stats-tab-${entry.id}`}
              aria-selected={tab === entry.id}
              aria-controls="stats-tabpanel"
              tabIndex={tab === entry.id ? 0 : -1}
              className={tab === entry.id ? 'stats-modal__tab is-active' : 'stats-modal__tab'}
              onClick={() => setTab(entry.id)}
              onKeyDown={(event) => onTabKeyDown(event, index)}
              data-testid={`stats-tab-${entry.id}`}
            >
              {entry.label}
            </button>
          ))}
        </div>
        <div id="stats-tabpanel" role="tabpanel" aria-labelledby={`stats-tab-${tab}`} className="stats-modal__body">
          {loading && !data && <p role="status" className="eff-contract__empty">{t('statsModal.loading')}</p>}
          {failed && !data && (
            <div role="alert" className="eff-contract__empty">
              <p>{t('statsModal.error')}</p>
              <button type="button" className="eff-button" onClick={() => setAttempt((value) => value + 1)}>{t('statsModal.retry')}</button>
            </div>
          )}
          {data && tab === 'month' && (
            <PeriodPanel
              heading={monthLabel}
              realized={data.month.realized}
              planned={data.month.planned}
              plannedLabel={t('statsModal.plannedMonth')}
              noData={monthNoData}
              t={t}
              locale={locale}
              testId="eff-month"
            />
          )}
          {data && tab === 'year' && (
            <PeriodPanel
              heading={t('effectiveStats.yearHeading', { year })}
              realized={data.year.realized}
              planned={data.year.planned}
              plannedLabel={t('statsModal.plannedYear')}
              noData={data.calendarRows === 0}
              t={t}
              locale={locale}
              testId="eff-year"
            />
          )}
          {data && tab === 'target' && showContract && (
            <TargetPanel
              year={year}
              target={target}
              evaluation={data.contract}
              plannedMinutes={data.year.planned.effectiveMinutes}
              canConfigure={canConfigureTarget}
              onConfigure={onConfigureTarget}
              t={t}
              locale={locale}
            />
          )}
        </div>
        <p className="eff-card__disclaimer">{t('statsModal.footnote')}</p>
      </div>
    </ModalShell>
  );
}
