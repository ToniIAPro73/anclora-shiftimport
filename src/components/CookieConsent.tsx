import { useEffect, useState } from 'react';
import { useI18n } from '../lib/use-i18n';

type CookiePreferences = { necessary: true; analytics: boolean; marketing: boolean; updatedAt: string; version: 'v1' };
const STORAGE_KEY = 'anclora-cookie-consent-v1';
const defaults: CookiePreferences = { necessary: true, analytics: false, marketing: false, updatedAt: '', version: 'v1' };

export function CookieConsent() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState(false);
  const [preferences, setPreferences] = useState(defaults);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<CookiePreferences>;
        setPreferences({ necessary: true, analytics: Boolean(parsed.analytics), marketing: Boolean(parsed.marketing), updatedAt: parsed.updatedAt ?? '', version: 'v1' });
        return;
      }
    } catch {
      // Ignore malformed persisted preferences and show the modal again.
    }
    setOpen(true);
  }, []);
  useEffect(() => {
    const listener = () => { setOpen(true); setSettings(true); };
    window.addEventListener('anclora:open-cookie-preferences', listener);
    return () => window.removeEventListener('anclora:open-cookie-preferences', listener);
  }, []);
  function persist(next: CookiePreferences) {
    const value = { ...next, necessary: true as const, updatedAt: new Date().toISOString(), version: 'v1' as const };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    setPreferences(value);
    setOpen(false);
    setSettings(false);
  }
  return (
    <>
      {open ? (
        <div role="dialog" aria-modal="true" aria-labelledby="shiftimport-cookie-title" className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: 520 }}>
            <h3 id="shiftimport-cookie-title" style={{ margin: 0 }}>{settings ? t('cookies.titleSettings') : t('cookies.titleBanner')}</h3>
            <p style={{ color: 'var(--text-muted)', lineHeight: 1.5 }}>{t('cookies.description')}</p>
            {settings ? (
              <div style={{ display: 'grid', gap: 10 }}>
                <CookieRow title={t('cookies.necessaryTitle')} description={t('cookies.necessaryDescription')} checked disabled onChange={() => {}} />
                <CookieRow title={t('cookies.analyticsTitle')} description={t('cookies.analyticsDescription')} checked={preferences.analytics} onChange={(analytics) => setPreferences((current) => ({ ...current, analytics }))} />
                <CookieRow title={t('cookies.marketingTitle')} description={t('cookies.marketingDescription')} checked={preferences.marketing} onChange={(marketing) => setPreferences((current) => ({ ...current, marketing }))} />
              </div>
            ) : null}
            <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
              {!settings ? <button className="btn-gold" type="button" onClick={() => persist({ ...defaults, analytics: true, marketing: true })}>{t('cookies.acceptAll')}</button> : null}
              <button className="btn-outline" type="button" onClick={() => settings ? persist(preferences) : setSettings(true)}>{settings ? t('cookies.save') : t('cookies.configure')}</button>
              <button className="btn-outline" type="button" onClick={() => persist(defaults)}>{t('cookies.rejectOptional')}</button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function CookieRow({ title, description, checked, disabled, onChange }: { title: string; description: string; checked: boolean; disabled?: boolean; onChange: (checked: boolean) => void }) {
  return <label style={{ display: 'flex', justifyContent: 'space-between', gap: 12, border: '1px solid var(--glass-border)', borderRadius: 12, padding: 12 }}><span><strong>{title}</strong><small style={{ display: 'block', color: 'var(--text-muted)', marginTop: 4 }}>{description}</small></span><input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} /></label>;
}
