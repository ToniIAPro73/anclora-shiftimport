import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CalendarCheck, Check, Loader2 } from 'lucide-react';
import { ModalShell } from '../ui/ModalShell';
import {
  listRemoteScheduleVersions,
  publishPendingRemoteVersions,
  type PublishPendingItem,
  type ScheduleVersion,
} from '../../lib/remote';
import { useI18n } from '../../lib/use-i18n';
import { getOperationalDate } from '../../lib/operational-date';
import { PUBLISH_PENDING_MAX, pendingVersions } from '../../lib/publish-pending';
import './PublishPendingDialog.css';

interface PublishPendingDialogProps {
  isOpen: boolean;
  areaId?: string | null;
  onClose: () => void;
  /** At least one week was published: the planner reloads. */
  onPublished: () => void;
}

const rangeLabel = (start: string, end: string, locale: string) => {
  const format = new Intl.DateTimeFormat(locale === 'es' ? 'es-ES' : 'en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  return `${format.format(new Date(`${start}T00:00:00Z`))} – ${format.format(new Date(`${end}T00:00:00Z`))}`;
};

/**
 * «Publicar semanas pendientes»: lists the draft weeks that are still to come (or under way), shows for each what the real publication
 * would do (a dry run of the server's own validations), and publishes only the ones the user ticks after confirming. Every week is its
 * own publication and has its own result; one that cannot be published writes nothing and does not stop the others.
 */
export function PublishPendingDialog({ isOpen, areaId = null, onClose, onPublished }: PublishPendingDialogProps) {
  const { t, locale } = useI18n();
  const [state, setState] = useState<'loading' | 'ready' | 'error' | 'publishing' | 'done'>('loading');
  const [versions, setVersions] = useState<ScheduleVersion[]>([]);
  const [checks, setChecks] = useState<Record<string, PublishPendingItem>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<PublishPendingItem[]>([]);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [overflow, setOverflow] = useState(false);
  const byId = useMemo(() => new Map(versions.map((version) => [version.id, version])), [versions]);

  const load = useCallback(async () => {
    setState('loading');
    setResults([]);
    try {
      const all = pendingVersions(await listRemoteScheduleVersions(areaId), getOperationalDate());
      const shown = all.slice(0, PUBLISH_PENDING_MAX);
      setOverflow(all.length > shown.length);
      setVersions(shown);
      if (shown.length === 0) { setChecks({}); setSelected(new Set()); setState('ready'); return; }
      const preview = await publishPendingRemoteVersions(shown.map((version) => version.id), 'preview');
      setChecks(Object.fromEntries(preview.results.map((item) => [item.versionId, item])));
      setSelected(new Set());
      setState('ready');
    } catch {
      setState('error');
    }
  }, [areaId]);

  useEffect(() => { if (isOpen) void load(); }, [isOpen, load]);

  // The confirm button disappears when the results arrive: hand focus to «Close» so it never falls back to <body>.
  useEffect(() => { if (state === 'done') closeRef.current?.focus(); }, [state]);

  const eligible = versions.filter((version) => checks[version.id]?.ok);
  const allSelected = eligible.length > 0 && eligible.every((version) => selected.has(version.id));
  const toggle = (id: string) => setSelected((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });

  const publish = async () => {
    const ids = versions.filter((version) => selected.has(version.id)).map((version) => version.id);
    if (ids.length === 0) return;
    setState('publishing');
    try {
      const response = await publishPendingRemoteVersions(ids, 'apply');
      setResults(response.results);
      setState('done');
      if (response.summary.ok > 0) onPublished();
    } catch {
      setState('error');
    }
  };

  const problem = (item: PublishPendingItem | undefined) => {
    if (!item || item.ok) return null;
    return t(`planner.publishPending.codes.${['OVERLAP', 'REST_RULE_VIOLATION', 'PAST_DATES_AFFECTED', 'SCOPE_FORBIDDEN', 'VERSION_NOT_EDITABLE', 'NOT_FOUND'].includes(item.code) ? item.code : 'ERROR'}`);
  };
  const busy = state === 'loading' || state === 'publishing';

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={() => { if (state !== 'publishing') onClose(); }}
      title={t('planner.publishPending.title')}
      closeAriaLabel={t('common.close')}
      maxWidth="760px"
      workspace
      height="auto"
      footer={(
        <>
          <button type="button" ref={closeRef} className="btn-outline" onClick={onClose} disabled={state === 'publishing'} data-testid="publish-pending-cancel">{state === 'done' ? t('common.close') : t('common.cancel')}</button>
          {state !== 'done' && (
            <button type="button" className="btn-gold" onClick={() => void publish()} disabled={busy || selected.size === 0} aria-busy={state === 'publishing'} data-testid="publish-pending-confirm">
              {state === 'publishing' ? <><Loader2 className="icon-spin" size={16} aria-hidden="true" /> {t('planner.publishPending.publishing')}</> : t(selected.size === 1 ? 'planner.publishPending.confirmOne' : 'planner.publishPending.confirm', { count: selected.size })}
            </button>
          )}
        </>
      )}
    >
      <div className="publish-pending" data-testid="publish-pending-dialog">
        <p>{t('planner.publishPending.intro')}</p>
        <p className="publish-pending__note">{t('planner.publishPending.notifyNote')}</p>

        {state === 'loading' && <p role="status" aria-busy="true" className="publish-pending__state"><Loader2 className="icon-spin" size={16} aria-hidden="true" /> {t('planner.publishPending.loading')}</p>}
        {state === 'error' && <p role="alert" className="publish-pending__error" data-testid="publish-pending-error">{t('planner.publishPending.error')}</p>}
        {state === 'ready' && versions.length === 0 && <p className="publish-pending__state" data-testid="publish-pending-empty">{t('planner.publishPending.none')}</p>}

        {state === 'done' && (
          <div role="status" data-testid="publish-pending-results">
            <h3><CalendarCheck size={15} aria-hidden="true" /> {t('planner.publishPending.resultTitle')}</h3>
            <ul className="publish-pending__list" tabIndex={0} aria-label={t('planner.publishPending.resultTitle')}>
              {results.map((item) => {
                const version = byId.get(item.versionId);
                const label = version ? rangeLabel(version.periodStart, version.periodEnd, locale) : item.versionId.slice(0, 8);
                return (
                  <li key={item.versionId} data-ok={item.ok} data-testid={`publish-pending-result-${item.versionId}`}>
                    {item.ok ? <Check size={14} aria-hidden="true" /> : <AlertTriangle size={14} aria-hidden="true" />}
                    <strong>{label}</strong>
                    {item.ok
                      ? <span>{t('planner.publishPending.published', { created: item.createdShiftCount ?? 0, excluded: item.excludedAssignmentCount ?? 0 })}</span>
                      : <span className="publish-pending__problem">{t('planner.publishPending.notPublished')} · {problem(item)}</span>}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {(state === 'ready' || state === 'publishing') && versions.length > 0 && (
          <>
            {overflow && <p className="publish-pending__note" data-testid="publish-pending-overflow">{t('planner.publishPending.overflow', { max: PUBLISH_PENDING_MAX })}</p>}
            <label className="publish-pending__all">
              <input type="checkbox" checked={allSelected} disabled={eligible.length === 0 || busy} onChange={() => setSelected(allSelected ? new Set() : new Set(eligible.map((version) => version.id)))} data-testid="publish-pending-select-all" />
              <span>{t('planner.publishPending.selectAll', { count: eligible.length })}</span>
            </label>
            <ul className="publish-pending__list" tabIndex={0} aria-label={t('planner.publishPending.title')} data-testid="publish-pending-list">
              {versions.map((version) => {
                const check = checks[version.id];
                const ok = Boolean(check?.ok);
                const excluded = check && check.ok ? (check.excludedCount ?? 0) : 0;
                const label = rangeLabel(version.periodStart, version.periodEnd, locale);
                return (
                  <li key={version.id} data-eligible={ok} data-testid={`publish-pending-row-${version.id}`}>
                    <input
                      type="checkbox"
                      checked={selected.has(version.id)}
                      disabled={!ok || busy}
                      onChange={() => toggle(version.id)}
                      aria-label={t('planner.publishPending.selectWeek', { week: label })}
                      data-testid={`publish-pending-select-${version.id}`}
                    />
                    <div>
                      <strong>{label}</strong>
                      <span className="publish-pending__status">{t('planner.statusDraft')}</span>
                      {check?.ok && <span>{t('planner.publishPending.assignments', { count: check.assignmentCount ?? 0 })}</span>}
                      {check?.ok && excluded > 0 && <span className="publish-pending__problem">{t('planner.publishPending.willExclude', { count: excluded })}</span>}
                      {check && !check.ok && <span className="publish-pending__problem" data-testid={`publish-pending-problem-${version.id}`}><AlertTriangle size={13} aria-hidden="true" /> {problem(check)}</span>}
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </ModalShell>
  );
}
