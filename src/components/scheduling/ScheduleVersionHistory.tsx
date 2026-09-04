import { Loader2 } from 'lucide-react';
import { ScheduleVersionHistoryEntry } from '../../lib/remote';
import { useI18n } from '../../lib/use-i18n';

interface ScheduleVersionHistoryProps {
  versions: ScheduleVersionHistoryEntry[];
  currentVersionId: string;
  isLoading: boolean;
  error: string | null;
  onSelect: (version: ScheduleVersionHistoryEntry) => void;
}

function statusLabel(status: ScheduleVersionHistoryEntry['status'], t: (key: string) => string): string {
  const labels: Record<ScheduleVersionHistoryEntry['status'], string> = {
    DRAFT: t('planner.historyStatusDraft'),
    PUBLISHED: t('planner.historyStatusPublished'),
    LOCKED: t('planner.historyStatusLocked'),
    COMPLETED: t('planner.historyStatusCompleted'),
  };
  return labels[status];
}

function formatTimestamp(value: string | null | undefined, locale: 'es' | 'en'): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(locale === 'es' ? 'es-ES' : 'en-GB', {
    dateStyle: 'medium', timeStyle: 'short',
  }).format(date);
}

export function ScheduleVersionHistory({
  versions, currentVersionId, isLoading, error, onSelect,
}: ScheduleVersionHistoryProps) {
  const { locale, t } = useI18n();

  if (isLoading) {
    return <div className="weekly-planner__history-state" role="status"><Loader2 className="icon-spin" size={20} aria-hidden="true" /> {t('planner.historyLoading')}</div>;
  }
  if (error) {
    return <div className="weekly-planner__history-state weekly-planner__history-state--error" role="alert">{error}</div>;
  }
  if (versions.length === 0) {
    return <div className="weekly-planner__history-state">{t('planner.historyEmpty')}</div>;
  }

  return (
    <div className="weekly-planner__history-table-wrap">
      <table className="weekly-planner__history-table" aria-label={t('planner.historyTableLabel')}>
        <caption className="sr-only">{t('planner.historyTableCaption')}</caption>
        <thead>
          <tr>
            <th scope="col">{t('planner.versionColumn')}</th>
            <th scope="col">{t('planner.statusColumn')}</th>
            <th scope="col">{t('planner.createdAtColumn')}</th>
            <th scope="col">{t('planner.publishedAtColumn')}</th>
            <th scope="col">{t('planner.historyActionColumn')}</th>
          </tr>
        </thead>
        <tbody>
          {versions.map((version) => (
            <tr key={version.id}>
              <th scope="row">
                <span>{t('planner.versionLabel', { count: version.versionNumber })}</span>
                {version.id === currentVersionId && <small>{t('planner.currentVersion')}</small>}
              </th>
              <td>{statusLabel(version.status, t)}</td>
              <td>{formatTimestamp(version.createdAt, locale)}</td>
              <td>{formatTimestamp(version.publishedAt, locale)}</td>
              <td><button type="button" className="btn-outline btn-outline--compact" onClick={() => onSelect(version)}>{t('planner.viewVersion')}</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
