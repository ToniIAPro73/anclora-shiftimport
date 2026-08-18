import { useEffect, useRef, useState } from 'react';
import { Upload, X } from 'lucide-react';
import { importAcceptAttribute, importFormatsDisplayLine } from '../../ingestion/formats';
import { loadUserProfile } from '../../lib/profile';
import { saveOnboardingStep } from '../../lib/onboarding';
import { trackTtfvEvent } from '../../lib/ttfv';
import { useI18n } from '../../lib/use-i18n';
import { useEscapeClose } from '../../lib/use-escape-close';

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Hands the chosen file to the caller, which opens ImportModal with it. */
  onFileChosen: (file: File) => void;
}

type WizardStep = 'source' | 'upload';

const SOURCE_OPTIONS = ['pdf', 'excel', 'csv', 'image', 'other'] as const;

/**
 * First-run wizard (Phase 1A): source → upload → hand off to ImportModal.
 *
 * Deliberately thin: no identity questions up front (the saved UserProfile is
 * only shown as an informational line), no duplicated preview — the wizard
 * ends by delegating the chosen file to the regular import flow. All funnel
 * state (onboarding step + TTFV events) is recorded here so the modal itself
 * stays a pure view.
 */
export const OnboardingModal = ({ isOpen, onClose, onFileChosen }: OnboardingModalProps) => {
  const { t } = useI18n();
  const [step, setStep] = useState<WizardStep>('source');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEscapeClose(isOpen, onClose);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setStep('source');
    trackTtfvEvent('onboarding_started');
    saveOnboardingStep('NEW_USER');
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  const profile = loadUserProfile();
  const existingIdentity = profile.displayName || profile.employeeIdentifiers[0] || '';

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0];
    if (!selected) {
      return;
    }
    trackTtfvEvent('document_selected');
    saveOnboardingStep('DOCUMENT_SELECTED');
    onFileChosen(selected);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content onboarding-modal-content" style={{ maxWidth: 520 }}>
        <button
          onClick={onClose}
          aria-label={t('onboarding.closeAria')}
          style={{ position: 'absolute', top: 'var(--space-md)', right: 'var(--space-md)', color: 'var(--text-subtle)', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          <X size={24} />
        </button>

        <h2 style={{ fontSize: '1.35rem', fontWeight: 800, margin: '0 0 4px', paddingRight: '32px' }}>
          {t('onboarding.title')}
        </h2>
        <p style={{ margin: '0 0 var(--space-lg)', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          {t('onboarding.subtitle')}
        </p>

        {step === 'source' ? (
          <>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 700, margin: '0 0 var(--space-sm)' }}>
              {t('onboarding.stepSource')}
            </h3>
            <div className="onboarding-source-grid">
              {SOURCE_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  className="btn-outline onboarding-source-option"
                  onClick={() => setStep('upload')}
                >
                  {t(`onboarding.sourceOptions.${option}`)}
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 700, margin: '0 0 var(--space-sm)' }}>
              {t('onboarding.stepUpload')}
            </h3>
            {existingIdentity && (
              <p style={{ margin: '0 0 var(--space-sm)', fontSize: '0.8rem', color: 'var(--text-subtle)' }}>
                {t('onboarding.useExisting', { name: existingIdentity })}
              </p>
            )}
            <button
              type="button"
              className="import-upload-zone"
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: '2px dashed var(--glass-border)',
                borderRadius: '14px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                gap: '8px',
                padding: '18px 14px',
                minHeight: '120px',
                background: 'transparent',
                width: '100%',
                boxSizing: 'border-box',
              }}
            >
              <div style={{ background: 'var(--glass-bg)', padding: '12px', borderRadius: '50%' }}>
                <Upload size={28} color="var(--color-accent)" />
              </div>
              <div style={{ textAlign: 'center', minWidth: 0 }}>
                <p style={{ fontWeight: 700, margin: 0 }}>{t('importModal.uploadTitle')}</p>
                <p style={{ fontSize: '0.78rem', opacity: 0.6, margin: '4px 0 0', overflowWrap: 'anywhere' }}>
                  {importFormatsDisplayLine()}
                </p>
              </div>
            </button>
            <div className="onboarding-modal-actions" style={{ marginTop: 'var(--space-lg)' }}>
              <button type="button" className="btn-outline" onClick={() => setStep('source')}>
                {t('onboarding.back')}
              </button>
            </div>
          </>
        )}

        <input ref={fileInputRef} type="file" hidden accept={importAcceptAttribute()} onChange={handleFileChange} />
      </div>
    </div>
  );
};
