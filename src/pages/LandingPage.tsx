import { useState } from 'react';
import { navigate } from '../lib/route';
import { useI18n } from '../lib/use-i18n';
import { PublicHeader } from '../components/PublicHeader';
import { LegalFooter } from '../components/LegalFooter';

interface LandingPageProps {
  isAuthenticated: boolean;
}

const scrollToId = (id: string) => {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

/** Illustrative demo state (§13/§15 of the refine brief): fixed sample
 * roster, not wired to any real import — mirrors TeamImportModal's real
 * status colors (recognized/new) so the visual language stays consistent. */
const ROSTER_DEMO = [
  { id: 'am', name: 'Adriana Molina', status: 'recognized' as const },
  { id: 'ac', name: 'Andrés Costa', status: 'recognized' as const },
  { id: 'lr', name: 'Laura Riera', status: 'new' as const },
  { id: 'mp', name: 'Marta Pérez', status: 'recognized' as const },
];
const ROSTER_TOTAL = 40;
const ROSTER_DEFAULT_SELECTED = ['am', 'ac', 'lr'];

const INPUT_ROWS = [
  { name: 'Adriana Molina', cells: ['06–14', '06–14', 'DL'] },
  { name: 'Andrés Costa', cells: ['14–22', '14–22', '22–06'] },
  { name: 'Marta Pérez', cells: ['DL', '06–14', '06–14'] },
];

const CALENDAR_CELLS: Array<{ shift: string | null; variant?: 'accent' | 'muted' }> = [
  { shift: null },
  { shift: '06–14', variant: 'accent' },
  { shift: null },
  { shift: '14–22', variant: 'accent' },
  { shift: null },
  { shift: null, variant: 'muted' },
  { shift: '22–06', variant: 'accent' },
];

/**
 * Fase 1.2B-VISUAL landing: "Schedule Intelligence × Editorial SaaS" — real
 * capabilities only (PDF/CSV → employee detection → structured shifts →
 * calendar), Anclora tokens throughout, PublicHeader shared with /pricing
 * and the authenticated shell's toggle behavior.
 */
export const LandingPage = ({ isAuthenticated }: LandingPageProps) => {
  const { t, tl } = useI18n();
  const howItWorksSteps = [
    { title: t('landing.howItWorks.step1Title'), body: t('landing.howItWorks.step1Body') },
    { title: t('landing.howItWorks.step2Title'), body: t('landing.howItWorks.step2Body') },
    { title: t('landing.howItWorks.step3Title'), body: t('landing.howItWorks.step3Body') },
  ];
  const weekdays = tl('calendar.weekdays');
  const mondayFirstWeekdays = [...weekdays.slice(1), weekdays[0]];
  const [selectedRoster, setSelectedRoster] = useState<Set<string>>(new Set(ROSTER_DEFAULT_SELECTED));
  const toggleRosterRow = (id: string) => {
    setSelectedRoster((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };
  const selectAllRoster = () => setSelectedRoster(new Set(ROSTER_DEMO.map((row) => row.id)));
  const statusLabel = (status: 'recognized' | 'new') =>
    status === 'recognized' ? t('teamImport.statusRecognized') : t('teamImport.statusNew');

  return (
    <div className="landing-page">
      <PublicHeader isAuthenticated={isAuthenticated} />

      <section className="landing-hero landing-hero--asymmetric">
        <div className="landing-hero-bg" aria-hidden="true" />
        <div className="landing-hero-grid">
          <div className="landing-hero-copy">
            <span className="landing-hero-eyebrow">{t('landing.hero.eyebrow')}</span>
            <h1>{t('landing.hero.headline')}</h1>
            <p className="landing-hero-subhead">{t('landing.hero.subhead')}</p>
            <div className="landing-cta-row landing-cta-row--start">
              <button
                type="button"
                className="btn-gold"
                style={{ padding: '12px 22px', fontWeight: 800 }}
                onClick={() => navigate(isAuthenticated ? '/app' : '/signup')}
              >
                {isAuthenticated ? t('landing.goToApp') : t('landing.hero.ctaPrimary')}
              </button>
              <button
                type="button"
                className="btn-outline"
                style={{ padding: '12px 22px', fontWeight: 700 }}
                onClick={() => scrollToId('how-it-works')}
              >
                {t('landing.hero.ctaSecondary')}
              </button>
            </div>
          </div>

          <div className="hero-stack" aria-hidden="true">
            <div className="hero-stack-card hero-stack-card--raw">
              <span className="hero-stack-card-label">{t('landing.hero.stackRawLabel')}</span>
              <span className="hero-stack-card-line">{t('landing.hero.stackRawLine')}</span>
              <div className="hero-stack-card-rows">
                <span />
                <span />
                <span />
              </div>
            </div>
            <div className="hero-stack-card hero-stack-card--parsing">
              <span className="hero-stack-card-label">{t('landing.hero.stackParsingLabel')}</span>
              <span className="hero-stack-card-line">{t('landing.hero.stackParsingLine')}</span>
            </div>
            <div className="hero-stack-card hero-stack-card--calendar">
              <span className="hero-stack-card-label">{t('landing.hero.stackCalendarLabel')}</span>
              <span className="hero-stack-card-line">{t('landing.hero.stackCalendarLine')}</span>
              <div className="hero-stack-card-rows hero-stack-card-rows--calendar">
                <span />
                <span />
                <span />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-section before-after">
        <h2 style={{ textAlign: 'center', marginBottom: 'var(--space-xl)' }}>{t('landing.beforeAfter.title')}</h2>
        <div className="before-after-grid">
          <article className="before-after-card before-after-card--before">
            <span className="before-after-card-label">{t('landing.beforeAfter.beforeLabel')}</span>
            <p>{t('landing.beforeAfter.beforeBody')}</p>
          </article>
          <article className="before-after-card before-after-card--after">
            <span className="before-after-card-label">{t('landing.beforeAfter.afterLabel')}</span>
            <p>{t('landing.beforeAfter.afterBody')}</p>
          </article>
        </div>
      </section>

      <section id="how-it-works" className="landing-section">
        <h2 style={{ textAlign: 'center', marginBottom: 'var(--space-xl)' }}>{t('landing.howItWorks.title')}</h2>
        <div className="landing-steps">
          {howItWorksSteps.map((step, index) => (
            <article key={step.title} className="landing-step-card">
              <span className="landing-step-number">{index + 1}</span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-section transformation-section">
        <h2 style={{ textAlign: 'center', marginBottom: 'var(--space-xs)' }}>{t('landing.transformation.title')}</h2>
        <p className="transformation-subtitle">{t('landing.transformation.subtitle')}</p>

        <div className="transformation-flow">
          <div className="flow-block flow-block--input">
            <span className="flow-block-label">{t('landing.transformation.inputLabel')}</span>
            <div className="flow-doc">
              <div className="flow-doc-header">
                <span className="flow-doc-badge">PDF</span>
                <span className="flow-doc-filename">{t('landing.transformation.inputFilename')}</span>
              </div>
              <div className="flow-doc-rows">
                {INPUT_ROWS.map((row) => (
                  <div key={row.name} className="flow-doc-row">
                    <span className="flow-doc-name">{row.name}</span>
                    {row.cells.map((cell, index) => (
                      <span key={index} className="flow-doc-cell">{cell}</span>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flow-connector" aria-hidden="true">→</div>

          <div className="flow-block flow-block--detect">
            <span className="flow-block-label">{t('landing.transformation.detectLabel')}</span>
            <div className="flow-detect-stat">
              <strong>{ROSTER_TOTAL}</strong>
              <span>{t('landing.transformation.statDetected')}</span>
            </div>
            <div className="flow-pill-row">
              <span className="flow-pill flow-pill--recognized">38 {t('teamImport.statusRecognized')}</span>
              <span className="flow-pill flow-pill--new">2 {t('teamImport.statusNew')}</span>
            </div>
            <div className="flow-detect-rows">
              {ROSTER_DEMO.slice(0, 3).map((row) => (
                <div key={row.id} className="flow-detect-row">
                  <span>{row.status === 'recognized' ? '✓' : '+'} {row.name}</span>
                  <span className={`flow-pill flow-pill--${row.status}`}>{statusLabel(row.status)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flow-connector" aria-hidden="true">→</div>

          <div className="flow-block flow-block--output">
            <span className="flow-block-label">{t('landing.transformation.outputLabel')}</span>
            <div className="flow-calendar">
              <div className="flow-calendar-title">{t('landing.transformation.month')}</div>
              <div className="flow-calendar-header">
                {mondayFirstWeekdays.map((day, index) => (
                  <span key={index}>{day}</span>
                ))}
              </div>
              <div className="flow-calendar-grid">
                {CALENDAR_CELLS.map((cell, index) => (
                  <div key={index} className="flow-calendar-cell">
                    {cell.shift && <span className={`flow-calendar-shift flow-calendar-shift--${cell.variant}`}>{cell.shift}</span>}
                    {cell.variant === 'muted' && <span className="flow-calendar-shift flow-calendar-shift--muted">{t('landing.transformation.dayOff')}</span>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="segments" className="landing-section">
        <h2 style={{ textAlign: 'center', marginBottom: 'var(--space-md)' }}>{t('landing.team.title')}</h2>
        <p style={{ textAlign: 'center', color: 'var(--text-muted)', maxWidth: '640px', margin: '0 auto var(--space-xl)' }}>
          {t('landing.team.body')}
        </p>
        <div className="team-roster">
          <div className="team-roster-header">
            <span>{t('landing.team.rosterTitle')}</span>
            <div className="flow-pill-row">
              <span className="flow-pill flow-pill--recognized">38 {t('teamImport.statusRecognized')}</span>
              <span className="flow-pill flow-pill--new">2 {t('teamImport.statusNew')}</span>
            </div>
          </div>
          <div className="team-roster-rows">
            {ROSTER_DEMO.map((row) => (
              <label key={row.id} className="team-roster-row">
                <input
                  type="checkbox"
                  checked={selectedRoster.has(row.id)}
                  onChange={() => toggleRosterRow(row.id)}
                />
                <span className="team-roster-name">{row.name}</span>
                <span className={`flow-pill flow-pill--${row.status}`}>{statusLabel(row.status)}</span>
              </label>
            ))}
          </div>
          <div className="team-roster-footer">
            <span className="team-roster-count">
              {t('landing.team.selectedCount', { selected: selectedRoster.size, total: ROSTER_TOTAL })}
            </span>
            <div className="team-roster-actions">
              <button type="button" className="btn-outline" onClick={selectAllRoster}>
                {t('teamImport.selectAll')}
              </button>
              <button
                type="button"
                className="btn-gold"
                onClick={() => navigate(isAuthenticated ? '/app' : '/signup')}
              >
                {t('landing.team.importSelection')}
              </button>
            </div>
          </div>
        </div>

        <div className="landing-segments">
          <article className="landing-segment-card">
            <h3>{t('landing.segments.personalTitle')}</h3>
            <p>{t('landing.segments.personalBody')}</p>
          </article>
          <article className="landing-segment-card">
            <h3>{t('landing.segments.teamTitle')}</h3>
            <p>{t('landing.segments.teamBody')}</p>
          </article>
        </div>
      </section>

      <section className="landing-section pricing-teaser">
        <h2>{t('landing.pricingTeaser.title')}</h2>
        <p>{t('landing.pricingTeaser.body')}</p>
        <button type="button" className="btn-outline" onClick={() => navigate('/pricing')}>
          {t('landing.pricingTeaser.cta')}
        </button>
      </section>

      <section className="landing-final-cta">
        <h2>{t('landing.finalCta.title')}</h2>
        <button
          type="button"
          className="btn-gold"
          style={{ padding: '14px 26px', fontWeight: 800 }}
          onClick={() => navigate(isAuthenticated ? '/app' : '/signup')}
        >
          {isAuthenticated ? t('landing.goToApp') : t('landing.finalCta.cta')}
        </button>
      </section>

      <LegalFooter />
    </div>
  );
};
