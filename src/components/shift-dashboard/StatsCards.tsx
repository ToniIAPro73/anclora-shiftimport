import type { CSSProperties, ReactNode } from 'react';

export function HeroMetric({
  icon, label, value, context, testId, valueTestId,
}: { icon: ReactNode; label: string; value: string; context?: string; testId?: string; valueTestId?: string }) {
  return (
    <div className="hero-metric" data-testid={testId}>
      <span className="hero-metric__icon" aria-hidden="true">{icon}</span>
      <div className="hero-metric__text">
        <span className="hero-metric__label">{label}</span>
        <strong className="hero-metric__value" data-testid={valueTestId}>{value}</strong>
      </div>
      {context && <span className="hero-metric__context">{context}</span>}
    </div>
  );
}

export function MetricCard({
  icon, label, value, style, testId, wide = false,
}: { icon: ReactNode; label: string; value: string; style?: CSSProperties; testId?: string; wide?: boolean }) {
  return (
    <div className={wide ? 'metric-card metric-card--wide' : 'metric-card'} style={style} data-testid={testId}>
      <span className="metric-card__icon" aria-hidden="true">{icon}</span>
      <span className="metric-card__label">{label}</span>
      <strong className="metric-card__value">{value}</strong>
    </div>
  );
}

export function PlannedCard({
  icon, label, value, note, testId,
}: { icon: ReactNode; label: string; value: string; note: string; testId?: string }) {
  return (
    <div className="planned-card" data-testid={testId}>
      <span className="planned-card__icon" aria-hidden="true">{icon}</span>
      <div className="planned-card__text">
        <span className="planned-card__label">{label}</span>
        <strong className="planned-card__value">{value}</strong>
        <small className="planned-card__note">{note}</small>
      </div>
    </div>
  );
}
