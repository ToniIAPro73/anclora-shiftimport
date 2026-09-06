import { useMemo, useRef, useState } from 'react';
import { getPlanDefinition, getPlanIntentFromUrl, PlanId, PLAN_IDS } from '../../lib/plans';
import { OrganizationOnboardingInput } from '../../lib/session';
import { useI18n } from '../../lib/use-i18n';
import { ModalShell } from '../ui/ModalShell';

interface OnboardingChoiceModalProps {
  isOpen: boolean;
  onConfirm: (input: OrganizationOnboardingInput) => Promise<void>;
  onLogout: () => void;
  ownerDisplayName?: string;
  ownerEmail?: string;
}

type Step = 'plan' | 'organization' | 'areas' | 'owner' | 'admin' | 'summary';
interface AreaDraft { ref: string; name: string }

const PLAN_LABEL_KEYS: Record<PlanId, string> = {
  free: 'onboardingChoice.planFree',
  personal: 'onboardingChoice.planPersonal',
  team: 'onboardingChoice.planTeam',
};

/** Plan-aware organization bootstrap. Nothing organizational is persisted
 * until the final step; the API owns the transaction and validations. */
export const OnboardingChoiceModal = ({
  isOpen,
  onConfirm,
  onLogout,
  ownerDisplayName = '',
  ownerEmail = '',
}: OnboardingChoiceModalProps) => {
  const { t } = useI18n();
  const [plan, setPlan] = useState<PlanId>(() => getPlanIntentFromUrl() ?? 'team');
  const [step, setStep] = useState<Step>('plan');
  const [organizationName, setOrganizationName] = useState('');
  const [areasEnabled, setAreasEnabled] = useState(false);
  const [areas, setAreas] = useState<AreaDraft[]>([]);
  const [ownerIsEmployee, setOwnerIsEmployee] = useState(false);
  const [ownerEmployeeName, setOwnerEmployeeName] = useState(ownerDisplayName);
  const [ownerAreaRef, setOwnerAreaRef] = useState('');
  const [adminEnabled, setAdminEnabled] = useState(false);
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminIsEmployee, setAdminIsEmployee] = useState(false);
  const [adminEmployeeName, setAdminEmployeeName] = useState('');
  const [adminAreaRef, setAdminAreaRef] = useState('');
  const [error, setError] = useState('');
  const [errorField, setErrorField] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const organizationNameRef = useRef<HTMLInputElement>(null);
  const ownerEmployeeRef = useRef<HTMLInputElement>(null);
  const adminNameRef = useRef<HTMLInputElement>(null);
  const adminEmailRef = useRef<HTMLInputElement>(null);

  const steps = useMemo<Step[]>(() => plan === 'team'
    ? ['plan', 'organization', 'areas', 'owner', 'admin', 'summary']
    : ['plan', 'organization', 'owner', 'summary'], [plan]);
  const stepIndex = Math.max(0, steps.indexOf(step));
  const currentStep = steps[stepIndex];
  const hasAreas = areasEnabled && areas.length > 0;
  const areaOptions = areas.filter((area) => area.name.trim());

  const showError = (message: string, field?: string, ref?: React.RefObject<HTMLInputElement>) => {
    setError(message);
    setErrorField(field ?? null);
    ref?.current?.focus();
  };

  const validateStep = (): boolean => {
    setError('');
    setErrorField(null);
    if (currentStep === 'organization' && !organizationName.trim()) {
      showError(t('onboardingChoice.orgNameRequired'), 'organization', organizationNameRef);
      return false;
    }
    if (currentStep === 'areas' && areasEnabled) {
      if (areas.length === 0 || areas.some((area) => !area.name.trim())) {
        showError(t('onboardingChoice.areaNameRequired'), 'areas');
        return false;
      }
      const names = areas.map((area) => area.name.trim().toLocaleLowerCase());
      if (new Set(names).size !== names.length) {
        showError(t('onboardingChoice.duplicateArea'), 'areas');
        return false;
      }
    }
    if (currentStep === 'owner' && ownerIsEmployee && !ownerEmployeeName.trim()) {
      showError(t('onboardingChoice.employeeNameRequired'), 'ownerEmployee', ownerEmployeeRef);
      return false;
    }
    if (currentStep === 'admin' && adminEnabled) {
      if (!adminName.trim()) {
        showError(t('onboardingChoice.adminNameRequired'), 'adminName', adminNameRef);
        return false;
      }
      if (!adminEmail.trim() || !/^\S+@\S+\.\S+$/.test(adminEmail.trim())) {
        showError(t('onboardingChoice.adminEmailRequired'), 'adminEmail', adminEmailRef);
        return false;
      }
      if (adminIsEmployee && !adminEmployeeName.trim()) {
        showError(t('onboardingChoice.employeeNameRequired'), 'adminEmployee');
        return false;
      }
    }
    return true;
  };

  const next = () => {
    if (!validateStep()) return;
    setStep(steps[Math.min(stepIndex + 1, steps.length - 1)]);
  };
  const previous = () => {
    setError('');
    setErrorField(null);
    setStep(steps[Math.max(stepIndex - 1, 0)]);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (currentStep !== 'summary') {
      next();
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onConfirm({
        plan,
        organization: { name: organizationName.trim() },
        areas: plan === 'team' && areasEnabled
          ? areas.map((area, index) => ({ name: area.name.trim(), ref: area.ref || `area-${index}` }))
          : [],
        owner: {
          isEmployee: ownerIsEmployee,
          employeeName: ownerIsEmployee ? ownerEmployeeName.trim() : undefined,
          areaRef: ownerIsEmployee ? ownerAreaRef || null : null,
        },
        ...(plan === 'team' && adminEnabled ? {
          admin: {
            name: adminName.trim(),
            email: adminEmail.trim().toLowerCase(),
            isEmployee: adminIsEmployee,
            employeeName: adminIsEmployee ? adminEmployeeName.trim() : undefined,
            areaRef: adminIsEmployee ? adminAreaRef || null : null,
          },
        } : {}),
      });
    } catch {
      setError(t('onboardingChoice.failed'));
    } finally {
      setBusy(false);
    }
  };

  const addArea = () => setAreas((current) => [...current, { ref: `area-${current.length}`, name: '' }]);
  const updateArea = (ref: string, name: string) => setAreas((current) => current.map((area) => area.ref === ref ? { ...area, name } : area));
  const removeArea = (ref: string) => setAreas((current) => current.filter((area) => area.ref !== ref));

  const renderPlan = () => (
    <section aria-labelledby="onboarding-plan-title">
      <h3 id="onboarding-plan-title" style={{ margin: '0 0 8px' }}>{t('onboardingChoice.planTitle')}</h3>
      <p className="onboarding-wizard__muted">{t('onboardingChoice.planDescription')}</p>
      <p className="onboarding-wizard__notice">{t('onboardingChoice.billingNotice')}</p>
      <div className="onboarding-wizard__plans" role="radiogroup" aria-label={t('onboardingChoice.planTitle')}>
        {PLAN_IDS.map((planId) => {
          const definition = getPlanDefinition(planId);
          return (
            <button type="button" key={planId} className={`onboarding-wizard__plan${plan === planId ? ' is-selected' : ''}`} role="radio" aria-checked={plan === planId} onClick={() => setPlan(planId)}>
              <strong>{t(`${PLAN_LABEL_KEYS[planId]}.label`)}</strong>
              <span>{t(`${PLAN_LABEL_KEYS[planId]}.description`)}</span>
              <small>{definition.limits.maxEmployees === null ? t('onboardingChoice.unlimitedEmployees') : t('onboardingChoice.employeeLimit', { count: definition.limits.maxEmployees })}</small>
            </button>
          );
        })}
      </div>
    </section>
  );

  const renderOrganization = () => (
    <section>
      <h3 style={{ margin: '0 0 8px' }}>{t('onboardingChoice.organizationStepTitle')}</h3>
      <p className="onboarding-wizard__muted">{t('onboardingChoice.organizationStepDescription')}</p>
      <label className="onboarding-wizard__field"><span>{t('onboardingChoice.orgNameLabel')}</span><input id="onboarding-choice-organization" className="modal-input" ref={organizationNameRef} value={organizationName} onChange={(event) => setOrganizationName(event.target.value)} aria-describedby={errorField === 'organization' ? 'onboarding-choice-error' : undefined} aria-invalid={errorField === 'organization' ? 'true' : undefined} autoFocus /></label>
    </section>
  );

  const renderAreas = () => (
    <section>
      <h3 style={{ margin: '0 0 8px' }}>{t('onboardingChoice.areasStepTitle')}</h3>
      <p className="onboarding-wizard__muted">{t('onboardingChoice.areasStepDescription')}</p>
      <fieldset className="onboarding-wizard__choice-group"><legend>{t('onboardingChoice.areasQuestion')}</legend><label><input type="radio" name="areas" checked={!areasEnabled} onChange={() => setAreasEnabled(false)} /> {t('common.no')}</label><label><input type="radio" name="areas" checked={areasEnabled} onChange={() => { setAreasEnabled(true); if (areas.length === 0) addArea(); }} /> {t('common.yes')}</label></fieldset>
      {areasEnabled && <div className="onboarding-wizard__area-list">{areas.map((area) => <div key={area.ref} className="onboarding-wizard__area-row"><input className="modal-input" aria-label={t('onboardingChoice.areaNameLabel')} value={area.name} placeholder={t('onboardingChoice.areaNamePlaceholder')} onChange={(event) => updateArea(area.ref, event.target.value)} /><button type="button" className="btn-outline" onClick={() => removeArea(area.ref)} aria-label={`${t('common.delete')} ${area.name || t('onboardingChoice.areaNameLabel')}`}>×</button></div>)}<button type="button" className="btn-outline" onClick={addArea}>{t('onboardingChoice.addArea')}</button></div>}
    </section>
  );

  const areaSelect = (id: string, value: string, onChange: (value: string) => void, label: string) => (
    <label className="onboarding-wizard__field"><span>{label}</span><select className="modal-input" id={id} value={value} onChange={(event) => onChange(event.target.value)}><option value="">{t('onboardingChoice.noArea')}</option>{areaOptions.map((area) => <option key={area.ref} value={area.ref}>{area.name}</option>)}</select></label>
  );

  const renderOwner = () => (
    <section>
      <h3 style={{ margin: '0 0 8px' }}>{t('onboardingChoice.ownerStepTitle')}</h3>
      <p className="onboarding-wizard__muted">{t('onboardingChoice.ownerStepDescription')}</p>
      <div className="onboarding-wizard__identity"><strong>{ownerDisplayName || ownerEmail}</strong><span>{ownerEmail}</span><small>{t('role.owner')}</small></div>
      <label className="onboarding-wizard__check"><input type="checkbox" checked={ownerIsEmployee} onChange={(event) => setOwnerIsEmployee(event.target.checked)} /> {t('onboardingChoice.ownerIsEmployeeLabel')}</label>
      {ownerIsEmployee && <><label className="onboarding-wizard__field"><span>{t('onboardingChoice.employeeNameLabel')}</span><input ref={ownerEmployeeRef} className="modal-input" value={ownerEmployeeName} onChange={(event) => setOwnerEmployeeName(event.target.value)} aria-invalid={errorField === 'ownerEmployee' ? 'true' : undefined} /></label>{hasAreas && areaSelect('onboarding-owner-area', ownerAreaRef, setOwnerAreaRef, t('onboardingChoice.areaLabel'))}</>}
    </section>
  );

  const renderAdmin = () => (
    <section>
      <h3 style={{ margin: '0 0 8px' }}>{t('onboardingChoice.adminStepTitle')}</h3>
      <p className="onboarding-wizard__muted">{t('onboardingChoice.adminStepDescription')}</p>
      <fieldset className="onboarding-wizard__choice-group"><legend>{t('onboardingChoice.adminQuestion')}</legend><label><input type="radio" name="admin" checked={!adminEnabled} onChange={() => setAdminEnabled(false)} /> {t('common.no')}</label><label><input type="radio" name="admin" checked={adminEnabled} onChange={() => setAdminEnabled(true)} /> {t('common.yes')}</label></fieldset>
      {adminEnabled && <div className="onboarding-wizard__form-grid"><label className="onboarding-wizard__field"><span>{t('onboardingChoice.adminNameLabel')}</span><input ref={adminNameRef} className="modal-input" value={adminName} onChange={(event) => setAdminName(event.target.value)} /></label><label className="onboarding-wizard__field"><span>{t('onboardingChoice.adminEmailLabel')}</span><input ref={adminEmailRef} type="email" className="modal-input" value={adminEmail} onChange={(event) => setAdminEmail(event.target.value)} /></label><label className="onboarding-wizard__check"><input type="checkbox" checked={adminIsEmployee} onChange={(event) => setAdminIsEmployee(event.target.checked)} /> {t('onboardingChoice.adminIsEmployeeLabel')}</label>{adminIsEmployee && <label className="onboarding-wizard__field"><span>{t('onboardingChoice.employeeNameLabel')}</span><input className="modal-input" value={adminEmployeeName} onChange={(event) => setAdminEmployeeName(event.target.value)} /></label>}{adminIsEmployee && hasAreas && areaSelect('onboarding-admin-area', adminAreaRef, setAdminAreaRef, t('onboardingChoice.areaLabel'))}</div>}
    </section>
  );

  const renderSummary = () => (
    <section>
      <h3 style={{ margin: '0 0 8px' }}>{t('onboardingChoice.summaryTitle')}</h3>
      <p className="onboarding-wizard__muted">{t('onboardingChoice.summaryDescription')}</p>
      <dl className="onboarding-wizard__summary"><div><dt>{t('onboardingChoice.summaryPlan')}</dt><dd>{t(`${PLAN_LABEL_KEYS[plan]}.label`)}</dd></div><div><dt>{t('onboardingChoice.summaryOrganization')}</dt><dd>{organizationName}</dd></div><div><dt>{t('onboardingChoice.summaryAreas')}</dt><dd>{areaOptions.length ? areaOptions.map((area) => area.name).join(', ') : t('onboardingChoice.noAreas')}</dd></div><div><dt>{t('onboardingChoice.summaryOwner')}</dt><dd>{ownerDisplayName || ownerEmail} · {ownerIsEmployee ? t('onboardingChoice.employeeYes') : t('onboardingChoice.employeeNo')}</dd></div>{adminEnabled && <div><dt>{t('onboardingChoice.summaryAdmin')}</dt><dd>{adminName} · {adminIsEmployee ? t('onboardingChoice.employeeYes') : t('onboardingChoice.employeeNo')}</dd></div>}</dl>
    </section>
  );

  return (
    <ModalShell isOpen={isOpen} onClose={onLogout} title={t('onboardingChoice.title')} blocking maxWidth="760px">
      <p className="onboarding-wizard__muted">{t('onboardingChoice.description')}</p>
      <ol className="onboarding-wizard__progress" aria-label={t('onboardingChoice.progressLabel')}>{steps.map((item, index) => <li key={item} aria-current={index === stepIndex ? 'step' : undefined}>{index + 1}. {t(`onboardingChoice.step.${item}`)}</li>)}</ol>
      <form onSubmit={(event) => void submit(event)}>
        {currentStep === 'plan' && renderPlan()}{currentStep === 'organization' && renderOrganization()}{currentStep === 'areas' && renderAreas()}{currentStep === 'owner' && renderOwner()}{currentStep === 'admin' && renderAdmin()}{currentStep === 'summary' && renderSummary()}
        {error && <p id="onboarding-choice-error" className="onboarding-wizard__error" role="alert">{error}</p>}
        <div className="onboarding-wizard__actions"><button type="button" className="btn-outline" onClick={onLogout} disabled={busy}>{t('auth.logoutAction')}</button><span style={{ display: 'flex', gap: '10px' }}>{stepIndex > 0 && <button type="button" className="btn-outline" onClick={previous} disabled={busy}>{t('onboardingChoice.back')}</button>}<button type="submit" className="btn-gold" disabled={busy} aria-busy={busy}>{currentStep === 'summary' ? t('onboardingChoice.confirm') : t('onboardingChoice.next')}</button></span></div>
      </form>
    </ModalShell>
  );
};
