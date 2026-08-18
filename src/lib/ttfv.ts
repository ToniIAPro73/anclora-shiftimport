/**
 * Time-to-first-value (TTFV) instrumentation — LOCAL ONLY.
 *
 * Records the timestamps of the first-run funnel (onboarding → document
 * selected → preview ready → import confirmed) in localStorage so the app
 * can measure how long a new user takes to get value. Prepared for a future
 * analytics opt-in: these events are NEVER transmitted anywhere.
 */

export type TtfvEventName =
  | 'onboarding_started'
  | 'document_selected'
  | 'preview_ready'
  | 'import_confirmed';

export interface TtfvEvent {
  name: TtfvEventName;
  at: number; // Date.now()
}

const TTFV_STORAGE_KEY = 'anclora_shiftimport_ttfv_v1';
const MAX_STORED_EVENTS = 100;

const hasLocalStorage = (): boolean => typeof localStorage !== 'undefined';

const EVENT_NAMES: TtfvEventName[] = [
  'onboarding_started',
  'document_selected',
  'preview_ready',
  'import_confirmed',
];

const normalizeEvent = (raw: Partial<TtfvEvent> | null | undefined): TtfvEvent | null => {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  if (!EVENT_NAMES.includes(raw.name as TtfvEventName) || typeof raw.at !== 'number') {
    return null;
  }
  return { name: raw.name as TtfvEventName, at: raw.at };
};

export const getTtfvEvents = (): TtfvEvent[] => {
  if (!hasLocalStorage()) {
    return [];
  }
  const data = localStorage.getItem(TTFV_STORAGE_KEY);
  if (!data) {
    return [];
  }
  try {
    const parsed = JSON.parse(data) as Array<Partial<TtfvEvent>>;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map(normalizeEvent)
      .filter((event): event is TtfvEvent => event !== null);
  } catch (e) {
    console.error('Failed to parse TTFV events from storage', e);
    return [];
  }
};

const persistEvents = (events: TtfvEvent[]): void => {
  if (!hasLocalStorage()) {
    return;
  }
  localStorage.setItem(TTFV_STORAGE_KEY, JSON.stringify(events));
};

/**
 * Appends an event. Consecutive same-name events are deduped (a re-render
 * must not double-count a funnel step) and storage is capped at 100 events,
 * dropping the oldest.
 */
export const trackTtfvEvent = (name: TtfvEventName, at: number = Date.now()): void => {
  const events = getTtfvEvents();
  const last = events[events.length - 1];
  if (last?.name === name) {
    return;
  }
  events.push({ name, at });
  persistEvents(events.slice(-MAX_STORED_EVENTS));
};

export const clearTtfvEvents = (): void => {
  if (!hasLocalStorage()) {
    return;
  }
  localStorage.removeItem(TTFV_STORAGE_KEY);
};

/**
 * Milliseconds from funnel start to first preview: onboarding_started when
 * present, otherwise document_selected (import without onboarding). Null
 * when either endpoint is missing.
 */
export const computeTtfvMs = (events: TtfvEvent[] = getTtfvEvents()): number | null => {
  const preview = events.find((event) => event.name === 'preview_ready');
  if (!preview) {
    return null;
  }
  const start = events.find((event) => event.name === 'onboarding_started')
    ?? events.find((event) => event.name === 'document_selected');
  if (!start) {
    return null;
  }
  return preview.at - start.at;
};
