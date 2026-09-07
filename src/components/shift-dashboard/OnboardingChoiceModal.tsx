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

type Step =
  | 'plan'
  | 'organization'
  | 'owner'
  | 'admin'
  | 'structure'
  | 'areas'
  | 'planners'
  | 'employees'
  | 'assignments'
  | 'summary';

type StructureChoice = 'none' | 'areas' | 'planners' | 'later';

interface AreaDraft {
  ref: string;
  name: string;
}


interface EmployeeDraft {
  ref: string;
  name: string;
  externalEmployeeId: string;
  areaRef: string;
}

const PLAN_LABEL_KEYS: Record<PlanId, string> = {
  free: 'onboardingChoice.planFree',
  personal: 'onboardingChoice.planPersonal',
  team: 'onboardingChoice.planTeam',
};

const SUGGESTED_AREAS = ['Operaciones', 'Rampa', 'Pasaje', 'Mantenimiento'];

/**
 * Plan-aware, non-technical organization bootstrap (P5.7-M04A).
 * Supports archetypes A-D with explicit User vs Employee separation,
 * progressive disclosure, and "configure later" on every optional step.
 */
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

  // Step 2: Owner (Explicit User vs Employee)
  const [ownerIsEmployee, setOwnerIsEmployee] = useState(false);
  const [ownerEmployeeName, setOwnerEmployeeName] = useState(ownerDisplayName);
  const [ownerAreaRef, setOwnerAreaRef] = useState('');

  // Step 3: Administrative Access (Optional)
  const [adminEnabled, setAdminEnabled] = useState(false);
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminIsEmployee, setAdminIsEmployee] = useState(false);
  const [adminEmployeeName, setAdminEmployeeName] = useState('');
  const [adminAreaRef, setAdminAreaRef] = useState('');

  // Step 4: Organizational Structure choice
  const [structureChoice, setStructureChoice] = useState<StructureChoice>('none');

  // Step 5: Areas (Optional)
  const [areas, setAreas] = useState<AreaDraft[]>([]);
  const [newAreaInput, setNewAreaInput] = useState('');

  // Step 6: Planners (Optional)
  const [plannersEnabled, setPlannersEnabled] = useState(false);
  const [plannerName, setPlannerName] = useState('');
  const [plannerEmail, setPlannerEmail] = useState('');
  const [plannerIsEmployee, setPlannerIsEmployee] = useState(false);
  const [plannerEmployeeName, setPlannerEmployeeName] = useState('');
  const [plannerScopeType, setPlannerScopeType] = useState<'ORGANIZATION' | 'AREAS' | 'EMPLOYEES' | null>('ORGANIZATION');
  const [plannerSelectedAreas, setPlannerSelectedAreas] = useState<string[]>([]);

  // Step 7: Employees (Optional)
  const [employeesEnabled, setEmployeesEnabled] = useState(false);
  const [employees, setEmployees] = useState<EmployeeDraft[]>([]);
  const [newEmpName, setNewEmpName] = useState('');
  const [newEmpExternalId, setNewEmpExternalId] = useState('');
  const [newEmpAreaRef, setNewEmpAreaRef] = useState('');

  // UI state
  const [error, setError] = useState('');
  const [errorField, setErrorField] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const organizationNameRef = useRef<HTMLInputElement>(null);
  const ownerEmployeeRef = useRef<HTMLInputElement>(null);
  const adminNameRef = useRef<HTMLInputElement>(null);
  const adminEmailRef = useRef<HTMLInputElement>(null);

  // Dynamic step list based on plan and chosen structure
  const steps = useMemo<Step[]>(() => {
    if (plan !== 'team') {
      return ['plan', 'organization', 'owner', 'summary'];
    }
    if (structureChoice === 'none' || structureChoice === 'later') {
      return ['plan', 'organization', 'owner', 'admin', 'structure', 'summary'];
    }
    if (structureChoice === 'areas') {
      return ['plan', 'organization', 'owner', 'admin', 'structure', 'areas', 'planners', 'employees', 'assignments', 'summary'];
    }
    if (structureChoice === 'planners') {
      return ['plan', 'organization', 'owner', 'admin', 'structure', 'planners', 'employees', 'assignments', 'summary'];
    }
    return ['plan', 'organization', 'owner', 'admin', 'structure', 'summary'];
  }, [plan, structureChoice]);

  const stepIndex = Math.max(0, steps.indexOf(step));
  const currentStep = steps[stepIndex] ?? 'plan';
  const areaOptions = areas.filter((area) => area.name.trim());
  const hasAreas = areaOptions.length > 0;

  const isOptionalStep = currentStep === 'areas' || currentStep === 'planners' || currentStep === 'employees' || currentStep === 'assignments';

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
    if (currentStep === 'areas' && areas.length > 0) {
      if (areas.some((area) => !area.name.trim())) {
        showError(t('onboardingChoice.areaNameRequired'), 'areas');
        return false;
      }
      const names = areas.map((area) => area.name.trim().toLocaleLowerCase());
      if (new Set(names).size !== names.length) {
        showError(t('onboardingChoice.duplicateArea'), 'areas');
        return false;
      }
    }
    if (currentStep === 'planners' && plannersEnabled && (plannerName.trim() || plannerEmail.trim())) {
      if (!plannerName.trim()) {
        showError(t('onboardingChoice.plannerNameRequired'), 'plannerName');
        return false;
      }
      if (!plannerEmail.trim() || !/^\S+@\S+\.\S+$/.test(plannerEmail.trim())) {
        showError(t('onboardingChoice.plannerEmailRequired'), 'plannerEmail');
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

  const skipToSummary = () => {
    setError('');
    setErrorField(null);
    setStep('summary');
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (currentStep !== 'summary') {
      next();
      return;
    }
    setBusy(true);
    setError('');

    const allPlanners: NonNullable<OrganizationOnboardingInput['planners']> = [];
    if (plannersEnabled && plannerName.trim() && plannerEmail.trim()) {
      allPlanners.push({
        name: plannerName.trim(),
        email: plannerEmail.trim().toLowerCase(),
        isEmployee: plannerIsEmployee,
        employeeName: plannerIsEmployee ? (plannerEmployeeName.trim() || plannerName.trim()) : undefined,
        plannerScopeType,
        scopedAreaRefs: plannerScopeType === 'AREAS' ? plannerSelectedAreas : [],
        scopedEmployeeRefs: [],
      });
    }

    try {
      await onConfirm({
        plan,
        organization: { name: organizationName.trim() },
        areas: plan === 'team'
          ? areas.filter((a) => a.name.trim()).map((area, index) => ({ name: area.name.trim(), ref: area.ref || `area-${index}` }))
          : [],
        owner: {
          isEmployee: ownerIsEmployee,
          employeeName: ownerIsEmployee ? ownerEmployeeName.trim() : undefined,
          areaRef: ownerIsEmployee ? ownerAreaRef || null : null,
        },
        ...(plan === 'team' && adminEnabled && adminName.trim() ? {
          admin: {
            name: adminName.trim(),
            email: adminEmail.trim().toLowerCase(),
            isEmployee: adminIsEmployee,
            employeeName: adminIsEmployee ? adminEmployeeName.trim() : undefined,
            areaRef: adminIsEmployee ? adminAreaRef || null : null,
          },
          admins: [{
            name: adminName.trim(),
            email: adminEmail.trim().toLowerCase(),
            isEmployee: adminIsEmployee,
            employeeName: adminIsEmployee ? adminEmployeeName.trim() : undefined,
            areaRef: adminIsEmployee ? adminAreaRef || null : null,
          }],
        } : {}),
        ...(plan === 'team' && allPlanners.length > 0 ? {
          planners: allPlanners.map((p) => ({
            ref: p.ref,
            name: p.name,
            email: p.email,
            isEmployee: p.isEmployee,
            employeeName: p.isEmployee ? p.employeeName : undefined,
            plannerScopeType: p.plannerScopeType,
            scopedAreaRefs: p.scopedAreaRefs,
            scopedEmployeeRefs: p.scopedEmployeeRefs,
          })),
        } : {}),
        ...(plan === 'team' && employees.length > 0 ? {
          employees: employees.map((e) => ({
            ref: e.ref,
            name: e.name,
            externalEmployeeId: e.externalEmployeeId || undefined,
            areaRef: e.areaRef || null,
          })),
        } : {}),
      });
    } catch {
      setError(t('onboardingChoice.failed'));
    } finally {
      setBusy(false);
    }
  };

  const addAreaNamed = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (areas.some((a) => a.name.toLowerCase() === trimmed.toLowerCase())) return;
    setAreas((current) => [...current, { ref: `area-${current.length}`, name: trimmed }]);
    setNewAreaInput('');
  };

  const removeArea = (ref: string) => setAreas((current) => current.filter((area) => area.ref !== ref));



  const addEmployeeNamed = (name: string, externalId: string, areaRef: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setEmployees((current) => [...current, {
      ref: `emp-${current.length}`,
      name: trimmed,
      externalEmployeeId: externalId.trim(),
      areaRef: areaRef.trim(),
    }]);
    setNewEmpName('');
    setNewEmpExternalId('');
    setNewEmpAreaRef('');
  };

  const removeEmployee = (ref: string) => setEmployees((current) => current.filter((emp) => emp.ref !== ref));

  const areaSelect = (id: string, value: string, onChange: (value: string) => void, label: string) => (
    <label className="onboarding-wizard__field">
      <span>{label}</span>
      <select className="modal-input" id={id} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{t('onboardingChoice.noArea')}</option>
        {areaOptions.map((area) => <option key={area.ref} value={area.ref}>{area.name}</option>)}
      </select>
    </label>
  );

  const renderPlan = () => (
    <section aria-labelledby="onboarding-plan-title">
      <h3 id="onboarding-plan-title" className="onboarding-wizard__section-title">{t('onboardingChoice.planTitle')}</h3>
      <p className="onboarding-wizard__muted">{t('onboardingChoice.planDescription')}</p>
      <p className="onboarding-wizard__notice">{t('onboardingChoice.billingNotice')}</p>
      <div className="onboarding-wizard__plans" role="radiogroup" aria-label={t('onboardingChoice.planTitle')}>
        {PLAN_IDS.map((planId) => {
          const definition = getPlanDefinition(planId);
          return (
            <button
              type="button"
              key={planId}
              className={`onboarding-wizard__plan${plan === planId ? ' is-selected' : ''}`}
              role="radio"
              aria-checked={plan === planId}
              onClick={() => setPlan(planId)}
            >
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
      <h3 className="onboarding-wizard__section-title">{t('onboardingChoice.organizationStepTitle')}</h3>
      <p className="onboarding-wizard__muted">{t('onboardingChoice.organizationStepDescription')}</p>
      <label className="onboarding-wizard__field">
        <span>{t('onboardingChoice.orgNameLabel')}</span>
        <input
          id="onboarding-choice-organization"
          className="modal-input"
          ref={organizationNameRef}
          value={organizationName}
          onChange={(event) => setOrganizationName(event.target.value)}
          aria-describedby={errorField === 'organization' ? 'onboarding-choice-error' : undefined}
          aria-invalid={errorField === 'organization' ? 'true' : undefined}
          autoFocus
        />
      </label>
    </section>
  );

  const renderOwner = () => (
    <section>
      <h3 className="onboarding-wizard__section-title">{t('onboardingChoice.ownerStepTitle')}</h3>
      <p className="onboarding-wizard__muted">{t('onboardingChoice.ownerStepDescription')}</p>
      <div className="onboarding-wizard__identity">
        <strong>{ownerDisplayName || ownerEmail}</strong>
        <span>{ownerEmail}</span>
        <small className="onboarding-wizard__badge">{t('role.owner')}</small>
      </div>

      <fieldset className="onboarding-wizard__choice-group">
        <legend>{t('onboardingChoice.ownerIsEmployeeQuestion')}</legend>
        <label className="onboarding-wizard__check">
          <input
            type="checkbox"
            checked={ownerIsEmployee}
            onChange={(event) => setOwnerIsEmployee(event.target.checked)}
            aria-label={t('onboardingChoice.ownerIsEmployeeLabel')}
          />
          <span>{t('onboardingChoice.ownerIsEmployeeLabel')}</span>
        </label>
      </fieldset>

      {ownerIsEmployee && (
        <div className="onboarding-wizard__card">
          <label className="onboarding-wizard__field">
            <span>{t('onboardingChoice.employeeNameLabel')}</span>
            <input
              ref={ownerEmployeeRef}
              className="modal-input"
              value={ownerEmployeeName}
              onChange={(event) => setOwnerEmployeeName(event.target.value)}
              aria-invalid={errorField === 'ownerEmployee' ? 'true' : undefined}
            />
          </label>
          {hasAreas && areaSelect('onboarding-owner-area', ownerAreaRef, setOwnerAreaRef, t('onboardingChoice.areaLabel'))}
        </div>
      )}
    </section>
  );

  const renderAdmin = () => (
    <section>
      <h3 className="onboarding-wizard__section-title">{t('onboardingChoice.adminStepTitle')}</h3>
      <p className="onboarding-wizard__muted">{t('onboardingChoice.adminStepDescription')}</p>

      <fieldset className="onboarding-wizard__choice-group">
        <legend>{t('onboardingChoice.adminQuestion')}</legend>
        <label>
          <input
            type="radio"
            name="admin-choice"
            checked={!adminEnabled}
            onChange={() => setAdminEnabled(false)}
          />{' '}
          {t('common.no')}
        </label>
        <label>
          <input
            type="radio"
            name="admin-choice"
            checked={adminEnabled}
            onChange={() => setAdminEnabled(true)}
          />{' '}
          {t('common.yes')}
        </label>
      </fieldset>

      {adminEnabled && (
        <div className="onboarding-wizard__card">
          <div className="onboarding-wizard__form-grid">
            <label className="onboarding-wizard__field">
              <span>{t('onboardingChoice.adminNameLabel')}</span>
              <input
                ref={adminNameRef}
                className="modal-input"
                value={adminName}
                onChange={(event) => setAdminName(event.target.value)}
              />
            </label>
            <label className="onboarding-wizard__field">
              <span>{t('onboardingChoice.adminEmailLabel')}</span>
              <input
                ref={adminEmailRef}
                type="email"
                className="modal-input"
                value={adminEmail}
                onChange={(event) => setAdminEmail(event.target.value)}
              />
            </label>
            <label className="onboarding-wizard__check">
              <input
                type="checkbox"
                checked={adminIsEmployee}
                onChange={(event) => setAdminIsEmployee(event.target.checked)}
                aria-label={t('onboardingChoice.adminIsEmployeeLabel')}
              />
              <span>{t('onboardingChoice.adminIsEmployeeLabel')}</span>
            </label>
            {adminIsEmployee && (
              <label className="onboarding-wizard__field">
                <span>{t('onboardingChoice.employeeNameLabel')}</span>
                <input
                  className="modal-input"
                  value={adminEmployeeName}
                  onChange={(event) => setAdminEmployeeName(event.target.value)}
                />
              </label>
            )}
            {adminIsEmployee && hasAreas && areaSelect('onboarding-admin-area', adminAreaRef, setAdminAreaRef, t('onboardingChoice.areaLabel'))}
          </div>
        </div>
      )}
    </section>
  );

  const renderStructure = () => (
    <section>
      <h3 className="onboarding-wizard__section-title">{t('onboardingChoice.structureStepTitle')}</h3>
      <p className="onboarding-wizard__muted">{t('onboardingChoice.structureStepDescription')}</p>

      <div className="onboarding-wizard__structure-cards" role="radiogroup" aria-label={t('onboardingChoice.structureStepTitle')}>
        <button
          type="button"
          className={`onboarding-wizard__structure-card${structureChoice === 'none' ? ' is-selected' : ''}`}
          role="radio"
          aria-checked={structureChoice === 'none'}
          onClick={() => setStructureChoice('none')}
        >
          <strong>{t('onboardingChoice.structureOptionNone')}</strong>
          <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{t('onboardingChoice.structureOptionNoneDesc')}</span>
        </button>

        <button
          type="button"
          className={`onboarding-wizard__structure-card${structureChoice === 'areas' ? ' is-selected' : ''}`}
          role="radio"
          aria-checked={structureChoice === 'areas'}
          onClick={() => setStructureChoice('areas')}
        >
          <strong>{t('onboardingChoice.structureOptionAreas')}</strong>
          <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{t('onboardingChoice.structureOptionAreasDesc')}</span>
        </button>

        <button
          type="button"
          className={`onboarding-wizard__structure-card${structureChoice === 'planners' ? ' is-selected' : ''}`}
          role="radio"
          aria-checked={structureChoice === 'planners'}
          onClick={() => setStructureChoice('planners')}
        >
          <strong>{t('onboardingChoice.structureOptionPlanners')}</strong>
          <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{t('onboardingChoice.structureOptionPlannersDesc')}</span>
        </button>

        <button
          type="button"
          className={`onboarding-wizard__structure-card${structureChoice === 'later' ? ' is-selected' : ''}`}
          role="radio"
          aria-checked={structureChoice === 'later'}
          onClick={() => setStructureChoice('later')}
        >
          <strong>{t('onboardingChoice.structureOptionLater')}</strong>
          <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{t('onboardingChoice.structureOptionLaterDesc')}</span>
        </button>
      </div>
    </section>
  );

  const renderAreas = () => (
    <section>
      <h3 className="onboarding-wizard__section-title">{t('onboardingChoice.areasStepTitle')}</h3>
      <p className="onboarding-wizard__muted">{t('onboardingChoice.areasStepDescription')}</p>

      <div style={{ marginBottom: '12px' }}>
        <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)' }}>Sugerencias rápidas:</span>
        <div className="onboarding-wizard__chip-group">
          {SUGGESTED_AREAS.map((suggested) => (
            <button
              key={suggested}
              type="button"
              className="onboarding-wizard__chip"
              onClick={() => addAreaNamed(suggested)}
            >
              + {suggested}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
        <input
          className="modal-input"
          style={{ flex: 1 }}
          value={newAreaInput}
          placeholder={t('onboardingChoice.areaNamePlaceholder')}
          onChange={(event) => setNewAreaInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              addAreaNamed(newAreaInput);
            }
          }}
          aria-label={t('onboardingChoice.areaNameLabel')}
        />
        <button
          type="button"
          className="btn-outline"
          onClick={() => addAreaNamed(newAreaInput)}
        >
          {t('onboardingChoice.addArea')}
        </button>
      </div>

      {areas.length > 0 && (
        <div className="onboarding-wizard__area-list">
          {areas.map((area) => (
            <div key={area.ref} className="onboarding-wizard__area-row">
              <input
                className="modal-input"
                aria-label={t('onboardingChoice.areaNameLabel')}
                value={area.name}
                onChange={(event) => {
                  const val = event.target.value;
                  setAreas((cur) => cur.map((a) => a.ref === area.ref ? { ...a, name: val } : a));
                }}
              />
              <button
                type="button"
                className="btn-outline"
                onClick={() => removeArea(area.ref)}
                aria-label={`${t('common.delete')} ${area.name || t('onboardingChoice.areaNameLabel')}`}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );

  const renderPlanners = () => (
    <section>
      <h3 className="onboarding-wizard__section-title">{t('onboardingChoice.plannersStepTitle')}</h3>
      <p className="onboarding-wizard__muted">{t('onboardingChoice.plannersStepDescription')}</p>

      <fieldset className="onboarding-wizard__choice-group">
        <legend>{t('onboardingChoice.plannersQuestion')}</legend>
        <label>
          <input
            type="radio"
            name="planners-choice"
            checked={!plannersEnabled}
            onChange={() => setPlannersEnabled(false)}
          />{' '}
          {t('common.no')}
        </label>
        <label>
          <input
            type="radio"
            name="planners-choice"
            checked={plannersEnabled}
            onChange={() => setPlannersEnabled(true)}
          />{' '}
          {t('common.yes')}
        </label>
      </fieldset>

      {plannersEnabled && (
        <div className="onboarding-wizard__card">
          <div className="onboarding-wizard__form-grid">
            <label className="onboarding-wizard__field">
              <span>{t('onboardingChoice.plannerNameLabel')}</span>
              <input
                className="modal-input"
                value={plannerName}
                onChange={(event) => setPlannerName(event.target.value)}
              />
            </label>
            <label className="onboarding-wizard__field">
              <span>{t('onboardingChoice.plannerEmailLabel')}</span>
              <input
                type="email"
                className="modal-input"
                value={plannerEmail}
                onChange={(event) => setPlannerEmail(event.target.value)}
              />
            </label>
            <label className="onboarding-wizard__check">
              <input
                type="checkbox"
                checked={plannerIsEmployee}
                onChange={(event) => setPlannerIsEmployee(event.target.checked)}
              />
              <span>{t('onboardingChoice.adminIsEmployeeLabel')}</span>
            </label>
            {plannerIsEmployee && (
              <label className="onboarding-wizard__field">
                <span>{t('onboardingChoice.employeeNameLabel')}</span>
                <input
                  className="modal-input"
                  value={plannerEmployeeName}
                  onChange={(event) => setPlannerEmployeeName(event.target.value)}
                />
              </label>
            )}
          </div>

          <div style={{ marginTop: '12px' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              {t('onboardingChoice.plannerScopeLabel')}
            </span>
            <div style={{ display: 'grid', gap: '8px', marginTop: '6px' }}>
              <label className="onboarding-wizard__check">
                <input
                  type="radio"
                  name="planner-scope"
                  checked={plannerScopeType === 'ORGANIZATION'}
                  onChange={() => setPlannerScopeType('ORGANIZATION')}
                />
                <span>{t('onboardingChoice.plannerScopeOrg')}</span>
              </label>
              {hasAreas && (
                <label className="onboarding-wizard__check">
                  <input
                    type="radio"
                    name="planner-scope"
                    checked={plannerScopeType === 'AREAS'}
                    onChange={() => setPlannerScopeType('AREAS')}
                  />
                  <span>{t('onboardingChoice.plannerScopeAreas')}</span>
                </label>
              )}
              {plannerScopeType === 'AREAS' && hasAreas && (
                <div style={{ paddingLeft: '24px', display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                  {areaOptions.map((area) => (
                    <label key={area.ref} className="onboarding-wizard__check">
                      <input
                        type="checkbox"
                        checked={plannerSelectedAreas.includes(area.ref)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setPlannerSelectedAreas((cur) => [...cur, area.ref]);
                          } else {
                            setPlannerSelectedAreas((cur) => cur.filter((r) => r !== area.ref));
                          }
                        }}
                      />
                      <span>{area.name}</span>
                    </label>
                  ))}
                </div>
              )}
              <label className="onboarding-wizard__check">
                <input
                  type="radio"
                  name="planner-scope"
                  checked={plannerScopeType === null}
                  onChange={() => setPlannerScopeType(null)}
                />
                <span>{t('onboardingChoice.plannerScopeLater')}</span>
              </label>
            </div>
          </div>
        </div>
      )}
    </section>
  );

  const renderEmployees = () => (
    <section>
      <h3 className="onboarding-wizard__section-title">{t('onboardingChoice.employeesStepTitle')}</h3>
      <p className="onboarding-wizard__muted">{t('onboardingChoice.employeesStepDescription')}</p>

      <fieldset className="onboarding-wizard__choice-group">
        <legend>{t('onboardingChoice.employeesQuestion')}</legend>
        <label>
          <input
            type="radio"
            name="employees-choice"
            checked={!employeesEnabled}
            onChange={() => setEmployeesEnabled(false)}
          />{' '}
          {t('common.no')}
        </label>
        <label>
          <input
            type="radio"
            name="employees-choice"
            checked={employeesEnabled}
            onChange={() => setEmployeesEnabled(true)}
          />{' '}
          {t('common.yes')}
        </label>
      </fieldset>

      {employeesEnabled && (
        <div className="onboarding-wizard__card">
          <div style={{ display: 'grid', gridTemplateColumns: hasAreas ? '1.5fr 1fr 1fr auto' : '2fr 1fr auto', gap: '8px', marginBottom: '12px' }}>
            <input
              className="modal-input"
              value={newEmpName}
              placeholder={t('onboardingChoice.employeeNamePlaceholder')}
              onChange={(e) => setNewEmpName(e.target.value)}
              aria-label={t('onboardingChoice.employeeNameLabel')}
            />
            <input
              className="modal-input"
              value={newEmpExternalId}
              placeholder={t('onboardingChoice.employeeExternalId')}
              onChange={(e) => setNewEmpExternalId(e.target.value)}
              aria-label={t('onboardingChoice.employeeExternalId')}
            />
            {hasAreas && (
              <select
                className="modal-input"
                value={newEmpAreaRef}
                onChange={(e) => setNewEmpAreaRef(e.target.value)}
                aria-label={t('onboardingChoice.areaLabel')}
              >
                <option value="">{t('onboardingChoice.noArea')}</option>
                {areaOptions.map((area) => <option key={area.ref} value={area.ref}>{area.name}</option>)}
              </select>
            )}
            <button
              type="button"
              className="btn-outline"
              onClick={() => addEmployeeNamed(newEmpName, newEmpExternalId, newEmpAreaRef)}
            >
              +
            </button>
          </div>

          {employees.length > 0 && (
            <div style={{ display: 'grid', gap: '6px' }}>
              {employees.map((emp) => (
                <div key={emp.ref} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderRadius: '8px', background: 'var(--glass-bg)', border: '1px solid var(--border-soft)' }}>
                  <span><strong>{emp.name}</strong> {emp.externalEmployeeId && <small style={{ color: 'var(--text-subtle)' }}>({emp.externalEmployeeId})</small>}</span>
                  <button type="button" className="btn-outline" onClick={() => removeEmployee(emp.ref)}>×</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );

  const renderAssignments = () => (
    <section>
      <h3 className="onboarding-wizard__section-title">{t('onboardingChoice.assignmentsStepTitle')}</h3>
      <p className="onboarding-wizard__muted">{t('onboardingChoice.assignmentsStepDescription')}</p>
      <div className="onboarding-wizard__card">
        <p style={{ margin: 0, fontSize: '0.86rem', color: 'var(--text-muted)' }}>
          {employees.length > 0
            ? `${employees.length} empleados registrados listos para asignar.`
            : 'No hay empleados registrados actualmente para asignar.'}
        </p>
        <p style={{ margin: '8px 0 0', fontSize: '0.82rem', color: 'var(--text-subtle)' }}>
          {t('onboardingChoice.summaryLaterNote')}
        </p>
      </div>
    </section>
  );

  const renderSummary = () => (
    <section>
      <h3 className="onboarding-wizard__section-title">{t('onboardingChoice.summaryTitle')}</h3>
      <p className="onboarding-wizard__muted">{t('onboardingChoice.summaryDescription')}</p>
      <dl className="onboarding-wizard__summary">
        <div>
          <dt>{t('onboardingChoice.summaryPlan')}</dt>
          <dd>{t(`${PLAN_LABEL_KEYS[plan]}.label`)}</dd>
        </div>
        <div>
          <dt>{t('onboardingChoice.summaryOrganization')}</dt>
          <dd>{organizationName}</dd>
        </div>
        <div>
          <dt>{t('onboardingChoice.summaryAreas')}</dt>
          <dd>{areaOptions.length ? areaOptions.map((area) => area.name).join(', ') : t('onboardingChoice.noAreas')}</dd>
        </div>
        <div>
          <dt>{t('onboardingChoice.summaryOwner')}</dt>
          <dd>{ownerDisplayName || ownerEmail} · {ownerIsEmployee ? t('onboardingChoice.employeeYes') : t('onboardingChoice.employeeNo')}</dd>
        </div>
        {adminEnabled && (
          <div>
            <dt>{t('onboardingChoice.summaryAdmin')}</dt>
            <dd>{adminName} · {adminIsEmployee ? t('onboardingChoice.employeeYes') : t('onboardingChoice.employeeNo')}</dd>
          </div>
        )}
        {plannersEnabled && Boolean(plannerName.trim()) && (
          <div>
            <dt>{t('onboardingChoice.summaryPlanners')}</dt>
            <dd>{plannerName.trim()}</dd>
          </div>
        )}
        {employees.length > 0 && (
          <div>
            <dt>{t('onboardingChoice.summaryEmployees')}</dt>
            <dd>{employees.length}</dd>
          </div>
        )}
      </dl>
      <p className="onboarding-wizard__notice" style={{ marginTop: '16px' }}>
        {t('onboardingChoice.summaryLaterNote')}
      </p>
    </section>
  );

  return (
    <ModalShell isOpen={isOpen} onClose={onLogout} title={t('onboardingChoice.title')} blocking workspace maxWidth="840px">
      <div className="onboarding-wizard__body">
        <ol className="onboarding-wizard__progress" aria-label={t('onboardingChoice.progressLabel')}>
          {steps.map((item, index) => (
            <li key={item} aria-current={index === stepIndex ? 'step' : undefined}>
              {index + 1}. {t(`onboardingChoice.step.${item}`)}
            </li>
          ))}
        </ol>
        <p className="onboarding-wizard__muted">{t('onboardingChoice.description')}</p>
        <form onSubmit={(event) => void submit(event)}>
          {currentStep === 'plan' && renderPlan()}
          {currentStep === 'organization' && renderOrganization()}
          {currentStep === 'owner' && renderOwner()}
          {currentStep === 'admin' && renderAdmin()}
          {currentStep === 'structure' && renderStructure()}
          {currentStep === 'areas' && renderAreas()}
          {currentStep === 'planners' && renderPlanners()}
          {currentStep === 'employees' && renderEmployees()}
          {currentStep === 'assignments' && renderAssignments()}
          {currentStep === 'summary' && renderSummary()}

          {error && <p id="onboarding-choice-error" className="onboarding-wizard__error" role="alert">{error}</p>}

          <div className="onboarding-wizard__actions">
            <button type="button" className="btn-outline" onClick={onLogout} disabled={busy}>
              {t('auth.logoutAction')}
            </button>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              {stepIndex > 0 && (
                <button type="button" className="btn-outline" onClick={previous} disabled={busy}>
                  {t('onboardingChoice.back')}
                </button>
              )}
              {isOptionalStep && (
                <button type="button" className="btn-outline" onClick={skipToSummary} disabled={busy}>
                  {t('onboardingChoice.skipStep')}
                </button>
              )}
              <button type="submit" className="btn-gold" disabled={busy} aria-busy={busy}>
                {currentStep === 'summary' ? t('onboardingChoice.confirm') : t('onboardingChoice.next')}
              </button>
            </div>
          </div>
        </form>
      </div>
    </ModalShell>
  );
};

