import { useMemo, useState } from 'react';
import {
  applyTokenAliasesToShiftTypes,
  AssistantAnswers,
  AssistantQuestion,
  buildProfileFromAnswers,
  EmployeeRowCandidate,
  parseWithDayMapping,
  parseWithSelectedRow,
  resolveRowForCandidate,
  selectorFromAnswers,
} from '../../ingestion/assistant';
import { analyzeShiftsFromItems, ItemAnalysis } from '../../ingestion/analysis';
import { findEmployeeRowItems, EmployeeSelector } from '../../ingestion/core/row-detection';
import { PdfTextItem } from '../../ingestion/core/text-items';
import { parseShiftsFromItems } from '../../ingestion/parsers/parse-items';
import { getIngestionProfile } from '../../ingestion/profiles';
import {
  analyzeRosterTable,
  buildTabularImportResult,
  buildTabularProfileFromAnswers,
  RosterTable,
} from '../../ingestion/tabular-assistant';
import { getDaysInMonth } from '../../lib/week';
import { saveFormatProfile, UserFormatProfile } from '../../lib/format-profiles';
import { CalendarImportContext, ParsedCalendarShift } from '../../lib/import-types';
import { ImportResult } from '../../lib/import-quality';
import { translateShiftTypeLabel } from '../../lib/i18n';
import { getShiftTypes } from '../../lib/shift-types';
import { useI18n } from '../../lib/use-i18n';

export interface AssistantCompletion {
  shifts: ParsedCalendarShift[];
  quality: ImportResult;
  /** persisted profile, or null when the user opted out of saving it */
  profile: UserFormatProfile | null;
}

interface ProfileAssistantPanelProps {
  questions: AssistantQuestion[];
  items: PdfTextItem[];
  context: CalendarImportContext;
  /** null in tabular (CSV) mode, where there is no positioned layout analysis */
  analysis: ItemAnalysis | null;
  /** parsed CSV table for the tabular assistant path (roster / UNKNOWN grids) */
  table?: RosterTable | null;
  /** selector used for the original analysis (fallback when no row is picked) */
  selector: EmployeeSelector;
  onComplete: (result: AssistantCompletion) => void;
  onCancel: () => void;
}

type TokenMeaning = AssistantAnswers['tokenMeanings'][string];

/**
 * Inline format assistant (Phase 1A, wave 3): renders the assistant questions
 * inside ImportModal, collects the answers and turns them into a PII-free
 * UserFormatProfile plus a one-shot re-parse. Row candidate labels are
 * display-only and never persisted (see ingestion/assistant.ts).
 */
export const ProfileAssistantPanel = ({
  questions,
  items,
  context,
  analysis,
  table = null,
  selector,
  onComplete,
  onCancel,
}: ProfileAssistantPanelProps) => {
  const { locale, t } = useI18n();
  const [selectedRow, setSelectedRow] = useState<EmployeeRowCandidate | null>(null);
  const [dayMappingConfirmed, setDayMappingConfirmed] = useState<boolean | null>(null);
  const [correctedDay, setCorrectedDay] = useState('');
  const [tokenMeanings, setTokenMeanings] = useState<Record<string, TokenMeaning>>({});
  const [saveProfile, setSaveProfile] = useState(true);

  const shiftTypes = useMemo(() => getShiftTypes(), []);

  const rowQuestion = questions.find((q) => q.kind === 'row-selection');
  const tokenQuestions = questions.filter(
    (q): q is Extract<AssistantQuestion, { kind: 'token-meaning' } | { kind: 'shift-code' }> =>
      q.kind === 'token-meaning' || q.kind === 'shift-code',
  );
  const dayMappingQuestion = questions.find(
    (q): q is Extract<AssistantQuestion, { kind: 'day-mapping' }> => q.kind === 'day-mapping',
  );

  const setTokenMeaning = (token: string, patch: Partial<TokenMeaning>) => {
    setTokenMeanings((current) => {
      const previous = current[token] ?? { kind: 'work' as const };
      return { ...current, [token]: { ...previous, ...patch } };
    });
  };

  const handleConfirm = () => {
    const correctedDayNumber = Number.parseInt(correctedDay, 10);
    const activeDayMapping = dayMappingConfirmed !== null ? dayMappingQuestion : undefined;
    const dayMappingAnswer = activeDayMapping
      ? {
        confirmed: dayMappingConfirmed as boolean,
        ...(!dayMappingConfirmed && Number.isInteger(correctedDayNumber)
          ? { correctedDay: correctedDayNumber }
          : {}),
      }
      : null;

    const answers: AssistantAnswers = {
      ...(selectedRow ? { selectedRow } : {}),
      ...(dayMappingAnswer ? { dayMapping: dayMappingAnswer } : {}),
      tokenMeanings,
    };

    // Tabular (CSV) mode: no positioned pipeline — the profile and the
    // re-parse are built directly from the parsed table (PII-free, see
    // ingestion/tabular-assistant.ts).
    if (table) {
      const tableAnalysis = analyzeRosterTable(table, selector);
      const profile = buildTabularProfileFromAnswers(table, tableAnalysis, answers);
      if (saveProfile) {
        saveFormatProfile(profile);
        applyTokenAliasesToShiftTypes(profile);
      }
      const { shifts, quality } = buildTabularImportResult(table, answers, context);
      onComplete({
        shifts,
        quality: { ...quality, shifts },
        profile: saveProfile ? profile : null,
      });
      return;
    }

    if (!analysis) {
      return; // positional mode requires the item analysis
    }

    const profile = buildProfileFromAnswers(items, context, analysis, answers);
    if (saveProfile) {
      saveFormatProfile(profile);
      applyTokenAliasesToShiftTypes(profile);
    }

    const sessionSelector = selectorFromAnswers(answers) ?? selector;
    const ingestionProfile = getIngestionProfile(analysis.structure.documentType);

    // Re-parse: a day-mapping answer forces the corrected column→day
    // assignment over the resolved row (manual selection or selector row);
    // otherwise the manually selected row when there is one, falling back to
    // the standard pipeline (token aliases just mirrored into the registry
    // apply).
    let shifts: ParsedCalendarShift[] = [];
    if (dayMappingAnswer && activeDayMapping && ingestionProfile) {
      const corrected = dayMappingAnswer.confirmed
        ? activeDayMapping.proposedDay
        : dayMappingAnswer.correctedDay;
      const row = selectedRow
        ? resolveRowForCandidate(items, selectedRow, ingestionProfile)
        : findEmployeeRowItems(items, sessionSelector, ingestionProfile.rowWindow);
      if (row && corrected !== undefined) {
        shifts = parseWithDayMapping(
          items,
          context,
          row,
          ingestionProfile,
          { columnIndex: activeDayMapping.columnIndex, day: corrected },
        );
      }
    } else if (selectedRow && ingestionProfile) {
      shifts = parseWithSelectedRow(items, context, selectedRow, ingestionProfile);
    } else {
      try {
        shifts = parseShiftsFromItems(items, context, sessionSelector);
      } catch {
        shifts = [];
      }
    }

    const { quality } = analyzeShiftsFromItems(items, context, sessionSelector);
    onComplete({
      shifts,
      quality: { ...quality, shifts },
      profile: saveProfile ? profile : null,
    });
  };

  const confirmDisabled = (rowQuestion !== undefined && selectedRow === null)
    || (dayMappingQuestion !== undefined && dayMappingConfirmed === false && !Number.isInteger(Number.parseInt(correctedDay, 10)));

  const segmentedButtonStyle = (active: boolean): React.CSSProperties => ({
    padding: '8px 14px',
    minHeight: 'auto',
    fontWeight: 700,
    ...(active ? {} : { opacity: 0.75 }),
  });

  return (
    <section
      aria-label={t('assistant.title')}
      style={{
        border: '1px solid var(--glass-border)',
        borderRadius: '12px',
        background: 'var(--panel-muted-bg)',
        padding: '14px',
        marginBottom: '12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
      }}
    >
      <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: 'var(--color-accent)' }}>
        {t('assistant.title')}
      </h3>

      {rowQuestion?.kind === 'row-selection' && (
        <div>
          <p style={{ margin: '0 0 8px', fontSize: '0.85rem', fontWeight: 700 }}>{t('assistant.rowQuestion')}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {rowQuestion.candidates.map((candidate) => {
              const isSelected = selectedRow?.rowIndex === candidate.rowIndex && selectedRow?.page === candidate.page;
              return (
                <button
                  key={`${candidate.page}-${candidate.rowIndex}`}
                  type="button"
                  className={isSelected ? 'btn-gold' : 'btn-outline'}
                  style={{ width: '100%', textAlign: 'left', padding: '10px 12px', minHeight: '44px' }}
                  onClick={() => setSelectedRow(candidate)}
                >
                  {candidate.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {tokenQuestions.map((question) => {
        const token = question.kind === 'shift-code' ? question.code : question.token;
        const meaning = tokenMeanings[token];
        const titleKey = question.kind === 'shift-code' ? 'assistant.shiftCodeQuestion' : 'assistant.tokenMeaningQuestion';
        const titleVars: Record<string, string> = question.kind === 'shift-code' ? { code: token } : { token };
        return (
          <div key={`${question.kind}-${token}`} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 700 }}>{t(titleKey, titleVars)}</p>
            <div role="group" aria-label={t('assistant.workOrRestQuestion')} style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                type="button"
                className={meaning?.kind === 'work' ? 'btn-gold' : 'btn-outline'}
                style={segmentedButtonStyle(meaning?.kind === 'work')}
                onClick={() => setTokenMeaning(token, { kind: 'work' })}
              >
                {t('assistant.workOption')}
              </button>
              <button
                type="button"
                className={meaning?.kind === 'rest' ? 'btn-gold' : 'btn-outline'}
                style={segmentedButtonStyle(meaning?.kind === 'rest')}
                onClick={() => setTokenMeaning(token, { kind: 'rest', shiftTypeId: undefined, startTime: undefined, endTime: undefined })}
              >
                {t('assistant.restOption')}
              </button>
            </div>
            {meaning?.kind === 'work' && (
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                <select
                  className="modal-input"
                  style={{ flex: '1 1 140px', minWidth: 120 }}
                  aria-label={t('assistant.shiftTypeLabel')}
                  value={meaning.shiftTypeId ?? ''}
                  onChange={(event) => setTokenMeaning(token, { shiftTypeId: event.target.value || undefined })}
                >
                  <option value="">{t('assistant.shiftTypeLabel')}</option>
                  {shiftTypes.map((type) => (
                    <option key={type.id} value={type.id}>
                      {translateShiftTypeLabel(type.id, locale, type.label)}
                    </option>
                  ))}
                </select>
                {question.kind === 'shift-code' && (
                  <>
                    <input
                      type="time"
                      className="modal-input"
                      style={{ flex: '0 1 110px' }}
                      aria-label={t('shiftModal.startLabel')}
                      value={meaning.startTime ?? ''}
                      onChange={(event) => setTokenMeaning(token, { startTime: event.target.value || undefined })}
                    />
                    <input
                      type="time"
                      className="modal-input"
                      style={{ flex: '0 1 110px' }}
                      aria-label={t('shiftModal.endLabel')}
                      value={meaning.endTime ?? ''}
                      onChange={(event) => setTokenMeaning(token, { endTime: event.target.value || undefined })}
                    />
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}

      {dayMappingQuestion && (
        <div>
          <p style={{ margin: '0 0 8px', fontSize: '0.85rem', fontWeight: 700 }}>
            {t('assistant.dayColumnQuestion', { day: dayMappingQuestion.proposedDay })}
          </p>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              type="button"
              className={dayMappingConfirmed === true ? 'btn-gold' : 'btn-outline'}
              style={segmentedButtonStyle(dayMappingConfirmed === true)}
              onClick={() => setDayMappingConfirmed(true)}
            >
              {t('common.yes')}
            </button>
            <button
              type="button"
              className={dayMappingConfirmed === false ? 'btn-gold' : 'btn-outline'}
              style={segmentedButtonStyle(dayMappingConfirmed === false)}
              onClick={() => setDayMappingConfirmed(false)}
            >
              {t('common.no')}
            </button>
            {dayMappingConfirmed === false && (
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                <span>{t('assistant.dayColumnCorrect')}</span>
                <input
                  type="number"
                  className="modal-input"
                  style={{ width: '72px', padding: '8px 10px' }}
                  min={1}
                  max={getDaysInMonth(context.year, context.month)}
                  aria-label={t('assistant.dayColumnCorrect')}
                  value={correctedDay}
                  onChange={(event) => setCorrectedDay(event.target.value)}
                />
              </label>
            )}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', borderTop: '1px solid var(--glass-border)', paddingTop: '12px' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          <input type="checkbox" checked={saveProfile} onChange={(event) => setSaveProfile(event.target.checked)} />
          {t('assistant.saveProfile')}
        </label>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button type="button" className="btn-outline" onClick={onCancel}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="btn-gold"
            style={{ flex: 1, minWidth: '160px' }}
            disabled={confirmDisabled}
            onClick={handleConfirm}
          >
            {t('assistant.confirm')}
          </button>
        </div>
      </div>
    </section>
  );
};
