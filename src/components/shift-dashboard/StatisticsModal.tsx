import { useEffect, useMemo, useState } from 'react';
import { BarChart3, CalendarCheck, CalendarClock, CalendarOff, Clock, EyeOff, Gauge, HeartPulse, Settings2, Star, Target, Umbrella } from 'lucide-react';
import type { Shift } from '../../lib/types';
import { computeEffectiveStats, evaluateAnnualTarget } from '../../lib/effective-calendar.js';
import type { ContractEvaluation, StatsBucket } from '../../lib/effective-calendar.js';
import { loadCalendarStats, type RemoteCalendarStats } from '../../lib/remote';
import { useI18n } from '../../lib/use-i18n';
import { formatDuration } from './format-duration';
import { ModalShell } from '../ui/ModalShell';
import { SegmentedTabs, type SegmentedTab } from '../ui/SegmentedTabs';
import { HeroMetric, MetricCard, PlannedCard } from './StatsCards';
import { NEUTRAL_ACCENT, shiftAccentStyle } from './stats-accents';
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

const ICON = 18;

function PeriodPanel({
  heading, contextLabel, realized, planned, plannedLabel, noData, t, locale, testId,
}: {
  heading: string;
  contextLabel: string;
  realized: StatsBucket;
  planned: StatsBucket;
  plannedLabel: string;
  noData: boolean;
  t: Translate;
  locale: string;
  testId: string;
}) {
  const days = (count: number) => t('effectiveStats.daysValue', { count });
  const hours = (minutes: number) => formatDuration(minutes, t, locale);
  if (noData) {
    return (
      <section className="stats-modal__panel" aria-label={heading} data-testid={testId}>
        <div className="stats-empty" data-testid={`${testId}-no-data`}>
          <BarChart3 size={28} aria-hidden="true" />
          <strong>{t('statsModal.noData')}</strong>
          <span>{heading}</span>
        </div>
      </section>
    );
  }
  return (
    <section className="stats-modal__panel" aria-label={heading} data-testid={testId}>
      <HeroMetric
        icon={<BarChart3 size={26} />}
        label={t('effectiveStats.realizedHours')}
        value={hours(realized.effectiveMinutes)}
        context={contextLabel}
        valueTestId={`${testId}-effective`}
      />
      <div className="metric-grid">
        <MetricCard icon={<Clock size={ICON} />} label={t('effectiveStats.regular')} value={hours(realized.regularMinutes)} style={shiftAccentStyle('Regular')} testId={`${testId}-regular`} />
        <MetricCard icon={<Star size={ICON} />} label={t('effectiveStats.extras')} value={hours(realized.extrasMinutes)} style={shiftAccentStyle('Extras')} testId={`${testId}-extras`} />
        <MetricCard icon={<EyeOff size={ICON} />} label={t('effectiveStats.absences')} value={hours(realized.absenceMinutes)} style={shiftAccentStyle('Ausencia')} testId={`${testId}-absence`} />
        <MetricCard icon={<CalendarCheck size={ICON} />} label={t('effectiveStats.workedDays')} value={days(realized.workedDays)} style={NEUTRAL_ACCENT} testId={`${testId}-worked-days`} />
        <MetricCard icon={<CalendarOff size={ICON} />} label={t('effectiveStats.freeDays')} value={days(realized.freeDays)} style={shiftAccentStyle('Libre')} testId={`${testId}-free-days`} />
        <MetricCard icon={<Umbrella size={ICON} />} label={t('effectiveStats.vacationDays')} value={days(realized.vacationDays)} style={shiftAccentStyle('Vacaciones')} testId={`${testId}-vacation-days`} />
        <MetricCard icon={<HeartPulse size={ICON} />} label={t('effectiveStats.sickLeaveDays')} value={days(realized.sickLeaveDays)} style={shiftAccentStyle('Baja')} testId={`${testId}-sick-days`} />
        <PlannedCard
          icon={<CalendarClock size={ICON} />}
          label={plannedLabel}
          value={hours(planned.effectiveMinutes)}
          note={t('statsModal.footnote')}
          testId={`${testId}-planned`}
        />
      </div>
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
  const hours = (minutes: number) => formatDuration(minutes, t, locale);
  const configureButton = (ghost: boolean, label: string, testId: string) => canConfigure && onConfigure && (
    <button type="button" className={ghost ? 'eff-button eff-button--ghost' : 'eff-button eff-button--primary'} onClick={onConfigure} data-testid={testId}>
      <Settings2 size={14} aria-hidden="true" /> {label}
    </button>
  );

  if (!target || evaluation.status === 'UNCONFIGURED') {
    return (
      <section className="stats-modal__panel" aria-label={heading} data-testid="eff-contract-card">
        <div className="target-hero">
          <Target size={30} aria-hidden="true" className="target-hero__icon" />
          <span className="hero-metric__label">{heading}</span>
          <strong className="target-hero__value" data-testid="eff-contract-unconfigured">{t('statsModal.targetUnconfigured')}</strong>
          <p className="target-hero__hint">{t('statsModal.configureHint')}</p>
          {configureButton(false, t('statsModal.configureTarget'), 'eff-contract-configure')}
        </div>
      </section>
    );
  }

  const hoursText = (minutes: number) => Math.round(minutes / 60).toLocaleString(locale === 'en' ? 'en-GB' : 'es-ES');
  const range = t('statsModal.targetRange', { min: hoursText(target.minimumAnnualMinutes), max: hoursText(target.maximumAnnualMinutes) });

  if (evaluation.status === 'NO_DATA') {
    return (
      <section className="stats-modal__panel" aria-label={heading} data-testid="eff-contract-card">
        <div className="target-hero">
          <Target size={30} aria-hidden="true" className="target-hero__icon" />
          <span className="hero-metric__label">{heading}</span>
          <strong className="target-hero__value" data-testid="eff-contract-range">{range}</strong>
          <p className="eff-status eff-status--no_data" data-testid="eff-contract-status" data-status="NO_DATA">
            <span className="eff-status__label">{t('effectiveStats.statusLabel')}:</span> {t('statsModal.statusNoData')}
          </p>
          {configureButton(true, t('effectiveStats.editTarget'), 'eff-contract-edit')}
        </div>
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
    ? t('effectiveStats.statusBelow', { amount: hours(evaluation.missingToMinimumMinutes ?? 0) })
    : evaluation.status === 'ABOVE_MAXIMUM'
      ? t('effectiveStats.statusAbove', { amount: hours(evaluation.excessOverMaximumMinutes ?? 0) })
      : t('effectiveStats.statusWithin');

  return (
    <section className="stats-modal__panel stats-modal__panel--target" aria-label={heading} data-testid="eff-contract-card">
      <HeroMetric
        icon={<Target size={26} />}
        label={t('effectiveStats.effectiveSoFar')}
        value={hours(effective)}
        context={range}
        valueTestId="eff-contract-effective"
      />
      <div
        className="eff-progress"
        role="progressbar"
        aria-label={t('effectiveStats.progressLabel')}
        aria-valuemin={0}
        aria-valuemax={Math.max(maximum, effective)}
        aria-valuenow={effective}
        aria-valuetext={`${hours(effective)} / ${hours(maximum)}`}
      >
        <div className="eff-progress__fill" style={{ width: `${fill}%` }} />
        <div className="eff-progress__marker" style={{ left: `${minMarker}%` }} aria-hidden="true" />
      </div>
      <div className="metric-grid metric-grid--target">
        <MetricCard icon={<Gauge size={ICON} />} label={t('effectiveStats.minimum')} value={hours(minimum)} style={NEUTRAL_ACCENT} testId="eff-contract-minimum" />
        <MetricCard icon={<Gauge size={ICON} />} label={t('effectiveStats.maximum')} value={hours(maximum)} style={NEUTRAL_ACCENT} testId="eff-contract-maximum" />
        <MetricCard icon={<Clock size={ICON} />} label={t('effectiveStats.marginUsed')} value={hours(evaluation.marginUsedMinutes ?? 0)} style={shiftAccentStyle('Regular')} testId="eff-contract-margin-used" />
        <MetricCard icon={<Clock size={ICON} />} label={t('effectiveStats.marginRemaining')} value={hours(evaluation.marginRemainingMinutes ?? 0)} style={shiftAccentStyle('Vacaciones')} testId="eff-contract-margin-remaining" />
        <div className="metric-card metric-card--status metric-card--wide">
          <span className="eff-status__label">{t('effectiveStats.statusLabel')}</span>
          <strong className={`eff-status eff-status--${evaluation.status.toLowerCase()}`} data-testid="eff-contract-status" data-status={evaluation.status}>{statusText}</strong>
        </div>
      </div>
      {plannedMinutes > 0 && (
        <PlannedCard
          icon={<CalendarClock size={ICON} />}
          label={t('effectiveStats.projection')}
          value={hours(effective + plannedMinutes)}
          note={t('effectiveStats.disclaimer')}
          testId="eff-contract-projection"
        />
      )}
      {configureButton(true, t('effectiveStats.editTarget'), 'eff-contract-edit')}
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

  const tabs: Array<SegmentedTab<Tab>> = [
    { id: 'month', label: t('statsModal.tabMonth'), shortLabel: t('statsModal.tabMonthShort') },
    { id: 'year', label: t('statsModal.tabYear', { year }), shortLabel: t('statsModal.tabYearShort') },
    ...(showContract ? [{ id: 'target' as Tab, label: t('statsModal.tabTarget'), shortLabel: t('statsModal.tabTargetShort') }] : []),
  ];

  const monthNoData = data ? data.month.realized.effectiveMinutes === 0 && data.month.planned.effectiveMinutes === 0
    && data.month.realized.workedDays + data.month.realized.freeDays + data.month.realized.vacationDays + data.month.realized.sickLeaveDays === 0 : false;

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title={t('statsModal.title')}
      maxWidth="800px"
      width="100%"
      className="stats-modal"
      fitViewport
      closeAriaLabel={t('common.close')}
      closeTestId="stats-modal-close"
    >
      <div data-testid="statistics-modal">
        <SegmentedTabs
          tabs={tabs}
          value={tab}
          onChange={setTab}
          ariaLabel={t('statsModal.tabsLabel')}
          idPrefix="stats-tab"
          panelId="stats-tabpanel"
          testIdPrefix="stats-tab"
        />
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
              contextLabel={monthLabel}
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
              contextLabel={String(year)}
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
      </div>
    </ModalShell>
  );
}
